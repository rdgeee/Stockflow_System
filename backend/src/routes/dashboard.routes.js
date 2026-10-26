import { Router } from "express";
import { pool } from "../config/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

const label = (s) => {
  const t = String(s ?? "").replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

router.get("/summary", asyncHandler(async (_req, res) => {
  const [[products]] = await pool.query("SELECT COUNT(*) AS n FROM products WHERE is_active = 1");
  const [[branches]] = await pool.query("SELECT COUNT(*) AS n, COUNT(DISTINCT city) AS cities FROM branches WHERE is_active = 1");
  const [[units]] = await pool.query("SELECT COALESCE(SUM(quantity_on_hand),0) AS n FROM inventory");
  const [[alerts]] = await pool.query("SELECT COUNT(*) AS n FROM low_stock_alerts WHERE status = 'open'");
  const [[poOpen]] = await pool.query("SELECT COUNT(*) AS n FROM purchase_orders WHERE status IN ('pending','ordered')");
  const [[trOpen]] = await pool.query("SELECT COUNT(*) AS n FROM stock_transfers WHERE status IN ('pending','approved','in_transit')");
  const [[awaiting]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM stock_transfers t WHERE t.status = 'approved'
               AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.transfer_id = t.transfer_id AND s.status <> 'cancelled'))
          + (SELECT COUNT(*) FROM purchase_orders p WHERE p.status = 'ordered'
               AND NOT EXISTS (SELECT 1 FROM shipments s WHERE s.purchase_order_id = p.po_id AND s.status <> 'cancelled')) AS n`);

  const [cats] = await pool.query(
    `SELECT COALESCE(p.category,'Uncategorized') AS category, COUNT(DISTINCT p.product_id) AS skus, COALESCE(SUM(i.quantity_on_hand),0) AS units
       FROM products p LEFT JOIN inventory i ON i.product_id = p.product_id WHERE p.is_active = 1
      GROUP BY COALESCE(p.category,'Uncategorized') ORDER BY units DESC`);
  const totalUnits = Number(units.n);
  const categories = cats.map((c) => ({ category: c.category, skus: Number(c.skus), units: Number(c.units), percent: totalUnits ? Math.round((Number(c.units) / totalUnits) * 100) : 0 }));

  const [flowRows] = await pool.query(
    `SELECT DATE_FORMAT(changed_at, '%Y-%m-%d') AS d,
            SUM(CASE WHEN action = 'STOCK_IN'  THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.delta')) AS SIGNED) ELSE 0 END) AS inbound,
            SUM(CASE WHEN action = 'STOCK_OUT' THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(new_value, '$.delta')) AS SIGNED) ELSE 0 END) AS outbound
       FROM audit_logs
      WHERE table_name = 'inventory' AND action IN ('STOCK_IN','STOCK_OUT') AND changed_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY d`);
  const byDay = new Map(flowRows.map((r) => [r.d, r]));
  const weeklyFlow = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const row = byDay.get(dayKey(d));
    weeklyFlow.push({ date: dayKey(d), day: d.toLocaleDateString("en-US", { weekday: "short" }), inbound: Number(row?.inbound || 0), outbound: Number(row?.outbound || 0) });
  }

  const [po] = await pool.query(
    `SELECT po.po_id AS id, po.status, po.order_date AS at, b.branch_name AS warehouse,
            (SELECT COUNT(*) FROM purchase_order_items i WHERE i.po_id = po.po_id) AS line_count,
            (SELECT COALESCE(SUM(i.quantity),0) FROM purchase_order_items i WHERE i.po_id = po.po_id) AS quantity,
            (SELECT p.product_name FROM purchase_order_items i JOIN products p ON p.product_id = i.product_id WHERE i.po_id = po.po_id ORDER BY i.po_item_id LIMIT 1) AS first_item
       FROM purchase_orders po JOIN branches b ON b.branch_id = po.branch_id ORDER BY po.po_id DESC LIMIT 6`);
  const [tr] = await pool.query(
    `SELECT t.transfer_id AS id, t.status, t.requested_at AS at, CONCAT(fb.branch_name, ' → ', tb.branch_name) AS warehouse,
            (SELECT COUNT(*) FROM stock_transfer_items i WHERE i.transfer_id = t.transfer_id) AS line_count,
            (SELECT COALESCE(SUM(i.quantity),0) FROM stock_transfer_items i WHERE i.transfer_id = t.transfer_id) AS quantity,
            (SELECT p.product_name FROM stock_transfer_items i JOIN products p ON p.product_id = i.product_id WHERE i.transfer_id = t.transfer_id ORDER BY i.transfer_item_id LIMIT 1) AS first_item
       FROM stock_transfers t JOIN branches fb ON fb.branch_id = t.from_branch_id JOIN branches tb ON tb.branch_id = t.to_branch_id
      ORDER BY t.transfer_id DESC LIMIT 6`);
  const fmt = (prefix) => (r) => ({
    id: `${prefix}-${String(r.id).padStart(4, "0")}`, at: r.at, item: r.line_count > 1 ? `${r.first_item} +${r.line_count - 1} more` : r.first_item,
    warehouse: r.warehouse, quantity: `${Number(r.quantity).toLocaleString("en-US")} units`, status: label(r.status),
  });
  const recentActivity = [...po.map(fmt("PO")), ...tr.map(fmt("TR"))].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 8);

  res.json({
    data: {
      totalProducts: Number(products.n), activeBranches: Number(branches.n), regions: Number(branches.cities),
      openOrders: Number(poOpen.n) + Number(trOpen.n), awaitingDispatch: Number(awaiting.n),
      lowStockAlerts: Number(alerts.n), totalUnits, categories, weeklyFlow, recentActivity,
    },
  });
}));

router.get("/reports", asyncHandler(async (_req, res) => {
  const [[low]] = await pool.query(
    `SELECT COUNT(*) AS n FROM inventory i JOIN products p ON p.product_id = i.product_id
      WHERE i.quantity_on_hand <= COALESCE(i.reorder_threshold_override, p.reorder_threshold, 0)`);
  const [[perf]] = await pool.query(
    `SELECT SUM(done) AS done, SUM(total) AS total FROM (
        SELECT SUM(status = 'received') AS done, SUM(status NOT IN ('cancelled')) AS total FROM purchase_orders WHERE order_date >= DATE_FORMAT(NOW(), '%Y-%m-01')
        UNION ALL
        SELECT SUM(status = 'completed'), SUM(status NOT IN ('cancelled','rejected')) FROM stock_transfers WHERE requested_at >= DATE_FORMAT(NOW(), '%Y-%m-01')) x`);
  const [[stock]] = await pool.query("SELECT COALESCE(SUM(quantity_on_hand),0) AS units FROM inventory");
  const [[br]] = await pool.query("SELECT COUNT(*) AS n FROM branches WHERE is_active = 1");
  const [[ship]] = await pool.query("SELECT COUNT(*) AS n FROM shipments WHERE status = 'delivered' AND delivered_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
  const total = Number(perf.total || 0);
  res.json({
    data: {
      inventoryHealth: { lowItems: Number(low.n) },
      orderPerformance: { fulfilledPercent: total ? Math.round((Number(perf.done || 0) / total) * 1000) / 10 : null, total },
      branchStock: { totalUnits: Number(stock.units), branches: Number(br.n), avgPerBranch: br.n ? Math.round(Number(stock.units) / Number(br.n)) : 0 },
      distribution: { deliveredThisWeek: Number(ship.n) },
    },
  });
}));

export default router;
