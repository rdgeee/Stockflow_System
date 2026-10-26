import { Router } from "express";
import { pool, withTransaction } from "../config/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";
import { paging, requireFields, toPositiveInt, validateItems } from "../utils/helpers.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize, ROLES } from "../middleware/auth.js";
import { receivePurchaseOrder } from "../services/purchaseOrderService.js";

const router = Router();
router.use(authenticate);
const canWrite = authorize(ROLES.COORDINATOR);

const SELECT = `SELECT po.po_id, po.coordinator_id, po.branch_id, po.supplier_id, po.status, po.order_date, po.expected_date,
                       b.branch_name, sp.supplier_name, CONCAT_WS(' ', u.first_name, u.last_name) AS coordinator_name,
                       (SELECT COUNT(*) FROM purchase_order_items i WHERE i.po_id = po.po_id) AS item_count,
                       (SELECT COALESCE(SUM(i.quantity),0) FROM purchase_order_items i WHERE i.po_id = po.po_id) AS total_quantity,
                       (SELECT COALESCE(SUM(i.quantity * i.unit_price),0) FROM purchase_order_items i WHERE i.po_id = po.po_id) AS total_amount
                  FROM purchase_orders po
                  JOIN branches b ON b.branch_id = po.branch_id
                  JOIN users u ON u.user_id = po.coordinator_id
             LEFT JOIN suppliers sp ON sp.supplier_id = po.supplier_id`;

async function getPO(id, conn = pool) {
  const [rows] = await conn.query(`${SELECT} WHERE po.po_id = ?`, [id]);
  if (!rows[0]) throw httpError(404, "Purchase order not found");
  const [items] = await conn.query(
    `SELECT i.po_item_id, i.product_id, i.quantity, i.unit_price, (i.quantity * i.unit_price) AS line_total, p.sku, p.product_name
       FROM purchase_order_items i JOIN products p ON p.product_id = i.product_id WHERE i.po_id = ?`, [id]);
  return { ...rows[0], items };
}

// Allowed manual status moves ("received" is only reachable via /receive or a delivered shipment).
const TRANSITIONS = { pending: ["ordered", "cancelled"], ordered: ["cancelled"] };

router.get("/", asyncHandler(async (req, res) => {
  const where = [], params = [];
  if (req.query.status) { where.push("po.status = ?"); params.push(req.query.status); }
  if (req.query.branch_id) { where.push("po.branch_id = ?"); params.push(req.query.branch_id); }
  if (req.query.q) { where.push("(b.branch_name LIKE ? OR sp.supplier_name LIKE ? OR CAST(po.po_id AS CHAR) LIKE ?)"); params.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`); }
  const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const { page, limit, offset } = paging(req.query);
  const [rows] = await pool.query(`${SELECT}${w} ORDER BY po.po_id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM purchase_orders po JOIN branches b ON b.branch_id = po.branch_id LEFT JOIN suppliers sp ON sp.supplier_id = po.supplier_id${w}`, params);
  res.json({ data: rows, meta: { page, limit, total } });
}));

router.get("/:id", asyncHandler(async (req, res) => res.json({ data: await getPO(req.params.id) })));

/** { branch_id, supplier_id?, expected_date?, items: [{product_id, quantity, unit_price?}] } */
router.post("/", canWrite, asyncHandler(async (req, res) => {
  requireFields(req.body, ["branch_id"]);
  const branchId = toPositiveInt(req.body.branch_id, "branch_id");
  const items = validateItems(req.body.items);
  const supplierId = req.body.supplier_id ? toPositiveInt(req.body.supplier_id, "supplier_id") : null;
  const coordinatorId = req.user.role === ROLES.ADMIN && req.body.coordinator_id ? Number(req.body.coordinator_id) : req.user.id;
  const id = await withTransaction(async (conn) => {
    const [prices] = await conn.query("SELECT product_id, unit_price FROM products WHERE product_id IN (?) AND is_active = 1", [items.map((i) => i.product_id)]);
    const priceMap = new Map(prices.map((p) => [p.product_id, p.unit_price]));
    for (const it of items) if (!priceMap.has(it.product_id)) throw httpError(400, `Product ${it.product_id} does not exist or is inactive`);
    if (supplierId) {
      const [s] = await conn.query("SELECT supplier_id FROM suppliers WHERE supplier_id = ? AND is_active = 1", [supplierId]);
      if (!s.length) throw httpError(400, "Supplier does not exist or is inactive");
    }
    const [r] = await conn.query("INSERT INTO purchase_orders (coordinator_id, branch_id, supplier_id, status, expected_date) VALUES (?,?,?, 'pending', ?)",
      [coordinatorId, branchId, supplierId, req.body.expected_date ? new Date(req.body.expected_date) : null]);
    await conn.query("INSERT INTO purchase_order_items (po_id, product_id, quantity, unit_price) VALUES ?",
      [items.map((i) => [r.insertId, i.product_id, i.quantity, i.unit_price !== undefined ? Number(i.unit_price) : priceMap.get(i.product_id)])]);
    await audit(conn, { table: "purchase_orders", recordId: r.insertId, action: "INSERT", newValue: { branchId, items }, userId: req.user.id });
    return r.insertId;
  });
  res.status(201).json({ data: await getPO(id) });
}));

/** { status: 'ordered' | 'cancelled' } */
router.patch("/:id/status", canWrite, asyncHandler(async (req, res) => {
  requireFields(req.body, ["status"]);
  await withTransaction(async (conn) => {
    const [rows] = await conn.query("SELECT * FROM purchase_orders WHERE po_id = ? FOR UPDATE", [req.params.id]);
    if (!rows[0]) throw httpError(404, "Purchase order not found");
    if (!(TRANSITIONS[rows[0].status] || []).includes(req.body.status)) {
      throw httpError(409, `Cannot change status from '${rows[0].status}' to '${req.body.status}'`);
    }
    await conn.query("UPDATE purchase_orders SET status = ? WHERE po_id = ?", [req.body.status, req.params.id]);
    await audit(conn, { table: "purchase_orders", recordId: rows[0].po_id, action: "STATUS", oldValue: { status: rows[0].status }, newValue: { status: req.body.status }, userId: req.user.id });
  });
  res.json({ data: await getPO(req.params.id) });
}));

/** Receive goods: adds the items to the branch's inventory. */
router.post("/:id/receive", authorize(ROLES.COORDINATOR, ROLES.MANAGER), asyncHandler(async (req, res) => {
  await withTransaction((conn) => receivePurchaseOrder(conn, req.params.id, req.user.id));
  res.json({ data: await getPO(req.params.id) });
}));

export default router;
