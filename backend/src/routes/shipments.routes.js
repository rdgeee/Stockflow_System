import { Router } from "express";
import { pool, withTransaction } from "../config/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";
import { paging, requireFields } from "../utils/helpers.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize, ROLES } from "../middleware/auth.js";
import { completeTransfer } from "../services/transferService.js";
import { receivePurchaseOrder } from "../services/purchaseOrderService.js";

const router = Router();
router.use(authenticate);

const SELECT = `SELECT s.*, CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name, v.plate_number, v.vehicle_type,
                       r.route_name, sp.supplier_name, ob.branch_name AS origin_name, db.branch_name AS destination_name
                  FROM shipments s
             LEFT JOIN users d ON d.user_id = s.driver_user_id
             LEFT JOIN vehicles v ON v.vehicle_id = s.vehicle_id
             LEFT JOIN routes r ON r.route_id = s.route_id
             LEFT JOIN purchase_orders po ON po.po_id = s.purchase_order_id
             LEFT JOIN suppliers sp ON sp.supplier_id = po.supplier_id
             LEFT JOIN branches ob ON ob.branch_id = s.origin_branch_id
             LEFT JOIN branches db ON db.branch_id = s.destination_branch_id`;
const COUNT = `SELECT COUNT(*) AS total FROM shipments s LEFT JOIN branches ob ON ob.branch_id = s.origin_branch_id LEFT JOIN branches db ON db.branch_id = s.destination_branch_id`;

const NEXT = { scheduled: ["in_transit", "cancelled"], in_transit: ["delivered", "cancelled"] };

async function getShipment(id, conn = pool) {
  const [rows] = await conn.query(`${SELECT} WHERE s.shipment_id = ?`, [id]);
  if (!rows[0]) throw httpError(404, "Shipment not found");
  return rows[0];
}

router.get("/", asyncHandler(async (req, res) => {
  const where = [], params = [];
  if (req.user.role === ROLES.DRIVER) { where.push("s.driver_user_id = ?"); params.push(req.user.id); } // drivers only see their own
  if (req.query.status) { where.push("s.status = ?"); params.push(req.query.status); }
  if (req.query.driver_user_id && req.user.role !== ROLES.DRIVER) { where.push("s.driver_user_id = ?"); params.push(req.query.driver_user_id); }
  if (req.query.q) { where.push("(s.shipment_number LIKE ? OR ob.branch_name LIKE ? OR db.branch_name LIKE ?)"); params.push(...Array(3).fill(`%${req.query.q}%`)); }
  const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const { page, limit, offset } = paging(req.query);
  const [rows] = await pool.query(`${SELECT}${w} ORDER BY s.shipment_id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [[{ total }]] = await pool.query(`${COUNT}${w}`, params);
  res.json({ data: rows, meta: { page, limit, total } });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const s = await getShipment(req.params.id);
  if (req.user.role === ROLES.DRIVER && s.driver_user_id !== req.user.id) throw httpError(403, "This shipment is not assigned to you");
  res.json({ data: s });
}));

/** Exactly one of purchase_order_id / transfer_id is required. */
router.post("/", authorize(ROLES.MANAGER, ROLES.COORDINATOR), asyncHandler(async (req, res) => {
  const b = req.body;
  if (!!b.purchase_order_id === !!b.transfer_id) throw httpError(400, "Provide exactly one of purchase_order_id or transfer_id");
  const id = await withTransaction(async (conn) => {
    let origin = b.origin_branch_id ?? null, dest = b.destination_branch_id ?? null;
    if (b.transfer_id) {
      const [t] = await conn.query("SELECT * FROM stock_transfers WHERE transfer_id = ?", [b.transfer_id]);
      if (!t[0]) throw httpError(404, "Transfer not found");
      if (t[0].status !== "approved") throw httpError(409, "Only approved transfers can be shipped");
      origin ??= t[0].from_branch_id; dest ??= t[0].to_branch_id;
    } else {
      const [p] = await conn.query("SELECT * FROM purchase_orders WHERE po_id = ?", [b.purchase_order_id]);
      if (!p[0]) throw httpError(404, "Purchase order not found");
      if (p[0].status !== "ordered") throw httpError(409, "Only ordered purchase orders can be shipped");
      dest ??= p[0].branch_id;
    }
    if (b.route_id) {
      const [r] = await conn.query("SELECT * FROM routes WHERE route_id = ?", [b.route_id]);
      if (!r[0]) throw httpError(404, "Route not found");
      origin ??= r[0].origin_branch_id; dest ??= r[0].destination_branch_id;
    }
    if (b.driver_user_id) {
      const [d] = await conn.query("SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = ? AND r.role_name = 'driver' AND u.is_active = 1", [b.driver_user_id]);
      if (!d[0]) throw httpError(400, "driver_user_id must be an active user with the driver role");
    }
    const tmp = `TMP-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    const [r] = await conn.query(
      `INSERT INTO shipments (shipment_number, purchase_order_id, transfer_id, driver_user_id, vehicle_id, route_id,
                              origin_branch_id, destination_branch_id, status, scheduled_at)
       VALUES (?,?,?,?,?,?,?,?, 'scheduled', ?)`,
      [tmp, b.purchase_order_id ?? null, b.transfer_id ?? null, b.driver_user_id ?? null, b.vehicle_id ?? null, b.route_id ?? null,
       origin, dest, b.scheduled_at ? new Date(b.scheduled_at) : new Date()]);
    const number = `SHP-${new Date().getFullYear()}-${String(r.insertId).padStart(5, "0")}`;
    await conn.query("UPDATE shipments SET shipment_number = ? WHERE shipment_id = ?", [number, r.insertId]);
    await audit(conn, { table: "shipments", recordId: r.insertId, action: "INSERT", newValue: { number, ...b }, userId: req.user.id });
    return r.insertId;
  });
  res.status(201).json({ data: await getShipment(id) });
}));

/** Update assignment/schedule while the shipment is still scheduled. */
router.put("/:id", authorize(ROLES.MANAGER, ROLES.COORDINATOR), asyncHandler(async (req, res) => {
  const s = await getShipment(req.params.id);
  if (s.status !== "scheduled") throw httpError(409, "Only scheduled shipments can be edited");
  const allowed = ["driver_user_id", "vehicle_id", "route_id", "scheduled_at"];
  const data = Object.fromEntries(allowed.filter((k) => req.body[k] !== undefined).map((k) => [k, req.body[k]]));
  if (!Object.keys(data).length) throw httpError(400, "No updatable fields supplied");
  if (data.scheduled_at) data.scheduled_at = new Date(data.scheduled_at);
  await pool.query("UPDATE shipments SET ? WHERE shipment_id = ?", [data, req.params.id]);
  await audit(pool, { table: "shipments", recordId: s.shipment_id, action: "UPDATE", oldValue: s, newValue: data, userId: req.user.id });
  res.json({ data: await getShipment(req.params.id) });
}));

/**
 * { status: 'in_transit' | 'delivered' | 'cancelled' }
 * 'delivered' completes the linked transfer (moves stock) or receives the linked purchase order (adds stock).
 */
router.patch("/:id/status", authorize(ROLES.MANAGER, ROLES.COORDINATOR, ROLES.DRIVER), asyncHandler(async (req, res) => {
  requireFields(req.body, ["status"]);
  await withTransaction(async (conn) => {
    const [rows] = await conn.query("SELECT * FROM shipments WHERE shipment_id = ? FOR UPDATE", [req.params.id]);
    const s = rows[0];
    if (!s) throw httpError(404, "Shipment not found");
    if (req.user.role === ROLES.DRIVER && s.driver_user_id !== req.user.id) throw httpError(403, "This shipment is not assigned to you");
    if (req.user.role === ROLES.DRIVER && req.body.status === "cancelled") throw httpError(403, "Drivers cannot cancel shipments");
    if (!(NEXT[s.status] || []).includes(req.body.status)) throw httpError(409, `Cannot change status from '${s.status}' to '${req.body.status}'`);

    const next = req.body.status;
    if (next === "in_transit") {
      await conn.query("UPDATE shipments SET status = 'in_transit' WHERE shipment_id = ?", [s.shipment_id]);
      if (s.transfer_id) await conn.query("UPDATE stock_transfers SET status = 'in_transit' WHERE transfer_id = ? AND status = 'approved'", [s.transfer_id]);
      if (s.vehicle_id) await conn.query("UPDATE vehicles SET status = 'in_use' WHERE vehicle_id = ?", [s.vehicle_id]);
    } else if (next === "delivered") {
      await conn.query("UPDATE shipments SET status = 'delivered', delivered_at = NOW() WHERE shipment_id = ?", [s.shipment_id]);
      if (s.transfer_id) await completeTransfer(conn, s.transfer_id, req.user.id);
      if (s.purchase_order_id) await receivePurchaseOrder(conn, s.purchase_order_id, req.user.id);
      if (s.vehicle_id) await conn.query("UPDATE vehicles SET status = 'available' WHERE vehicle_id = ?", [s.vehicle_id]);
    } else {
      await conn.query("UPDATE shipments SET status = 'cancelled' WHERE shipment_id = ?", [s.shipment_id]);
      if (s.transfer_id) await conn.query("UPDATE stock_transfers SET status = 'approved' WHERE transfer_id = ? AND status = 'in_transit'", [s.transfer_id]);
      if (s.vehicle_id) await conn.query("UPDATE vehicles SET status = 'available' WHERE vehicle_id = ?", [s.vehicle_id]);
    }
    await audit(conn, { table: "shipments", recordId: s.shipment_id, action: "STATUS", oldValue: { status: s.status }, newValue: { status: next }, userId: req.user.id });
  });
  res.json({ data: await getShipment(req.params.id) });
}));

export default router;
