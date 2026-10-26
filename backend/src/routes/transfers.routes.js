import { Router } from "express";
import { pool, withTransaction } from "../config/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";
import { paging, requireFields, toPositiveInt, validateItems } from "../utils/helpers.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize, ROLES } from "../middleware/auth.js";
import { completeTransfer, lockTransfer } from "../services/transferService.js";

const router = Router();
router.use(authenticate);

const SELECT = `SELECT t.transfer_id, t.from_branch_id, t.to_branch_id, t.requested_by, t.approved_by, t.status,
                       t.requested_at, t.approved_at, t.completed_at,
                       fb.branch_name AS from_branch, tb.branch_name AS to_branch,
                       CONCAT_WS(' ', rq.first_name, rq.last_name) AS requested_by_name,
                       CONCAT_WS(' ', ap.first_name, ap.last_name) AS approved_by_name,
                       (SELECT COUNT(*) FROM stock_transfer_items s WHERE s.transfer_id = t.transfer_id) AS item_count,
                       (SELECT COALESCE(SUM(s.quantity),0) FROM stock_transfer_items s WHERE s.transfer_id = t.transfer_id) AS total_quantity
                  FROM stock_transfers t
                  JOIN branches fb ON fb.branch_id = t.from_branch_id
                  JOIN branches tb ON tb.branch_id = t.to_branch_id
                  JOIN users rq ON rq.user_id = t.requested_by
             LEFT JOIN users ap ON ap.user_id = t.approved_by`;

async function getTransfer(id, conn = pool) {
  const [rows] = await conn.query(`${SELECT} WHERE t.transfer_id = ?`, [id]);
  if (!rows[0]) throw httpError(404, "Transfer not found");
  const [items] = await conn.query(
    `SELECT s.transfer_item_id, s.product_id, s.quantity, p.sku, p.product_name
       FROM stock_transfer_items s JOIN products p ON p.product_id = s.product_id WHERE s.transfer_id = ?`, [id]);
  return { ...rows[0], items };
}

/** Branch managers may only act on transfers leaving their own branch (admins: any). */
function assertCanDecide(user, transfer) {
  if (user.role === ROLES.MANAGER && user.branchId && user.branchId !== transfer.from_branch_id) {
    throw httpError(403, "Only the source branch manager can approve or reject this transfer");
  }
}

router.get("/", asyncHandler(async (req, res) => {
  const where = [], params = [];
  if (req.query.status) { where.push("t.status = ?"); params.push(req.query.status); }
  if (req.query.branch_id) { where.push("(t.from_branch_id = ? OR t.to_branch_id = ?)"); params.push(req.query.branch_id, req.query.branch_id); }
  if (req.query.q) { where.push("(fb.branch_name LIKE ? OR tb.branch_name LIKE ? OR CAST(t.transfer_id AS CHAR) LIKE ?)"); params.push(...Array(3).fill(`%${req.query.q}%`)); }
  const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const { page, limit, offset } = paging(req.query);
  const [rows] = await pool.query(`${SELECT}${w} ORDER BY t.transfer_id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM stock_transfers t JOIN branches fb ON fb.branch_id = t.from_branch_id JOIN branches tb ON tb.branch_id = t.to_branch_id${w}`, params);
  res.json({ data: rows, meta: { page, limit, total } });
}));

router.get("/:id", asyncHandler(async (req, res) => res.json({ data: await getTransfer(req.params.id) })));

/** { from_branch_id, to_branch_id, items: [{product_id, quantity}] } */
router.post("/", authorize(ROLES.MANAGER, ROLES.COORDINATOR), asyncHandler(async (req, res) => {
  requireFields(req.body, ["from_branch_id", "to_branch_id"]);
  const from = toPositiveInt(req.body.from_branch_id, "from_branch_id");
  const to = toPositiveInt(req.body.to_branch_id, "to_branch_id");
  if (from === to) throw httpError(400, "Source and destination branch must be different");
  const items = validateItems(req.body.items);
  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query("INSERT INTO stock_transfers (from_branch_id, to_branch_id, requested_by, status) VALUES (?,?,?, 'pending')", [from, to, req.user.id]);
    await conn.query("INSERT INTO stock_transfer_items (transfer_id, product_id, quantity) VALUES ?", [items.map((i) => [r.insertId, i.product_id, i.quantity])]);
    await audit(conn, { table: "stock_transfers", recordId: r.insertId, action: "INSERT", newValue: { from, to, items }, userId: req.user.id });
    return r.insertId;
  });
  res.status(201).json({ data: await getTransfer(id) });
}));

router.post("/:id/approve", authorize(ROLES.MANAGER), asyncHandler(async (req, res) => {
  await withTransaction(async (conn) => {
    const t = await lockTransfer(conn, req.params.id);
    assertCanDecide(req.user, t);
    if (t.status !== "pending") throw httpError(409, `Only pending transfers can be approved (current status: ${t.status})`);
    await conn.query("UPDATE stock_transfers SET status = 'approved', approved_by = ?, approved_at = NOW() WHERE transfer_id = ?", [req.user.id, t.transfer_id]);
    await audit(conn, { table: "stock_transfers", recordId: t.transfer_id, action: "APPROVE", oldValue: { status: t.status }, newValue: { status: "approved" }, userId: req.user.id });
  });
  res.json({ data: await getTransfer(req.params.id) });
}));

router.post("/:id/reject", authorize(ROLES.MANAGER), asyncHandler(async (req, res) => {
  await withTransaction(async (conn) => {
    const t = await lockTransfer(conn, req.params.id);
    assertCanDecide(req.user, t);
    if (t.status !== "pending") throw httpError(409, `Only pending transfers can be rejected (current status: ${t.status})`);
    await conn.query("UPDATE stock_transfers SET status = 'rejected', approved_by = ?, approved_at = NOW() WHERE transfer_id = ?", [req.user.id, t.transfer_id]);
    await audit(conn, { table: "stock_transfers", recordId: t.transfer_id, action: "REJECT", oldValue: { status: t.status }, newValue: { status: "rejected", reason: req.body?.reason ?? null }, userId: req.user.id });
  });
  res.json({ data: await getTransfer(req.params.id) });
}));

router.post("/:id/cancel", authorize(ROLES.MANAGER, ROLES.COORDINATOR), asyncHandler(async (req, res) => {
  await withTransaction(async (conn) => {
    const t = await lockTransfer(conn, req.params.id);
    if (!["pending", "approved"].includes(t.status)) throw httpError(409, `Transfer cannot be cancelled (current status: ${t.status})`);
    await conn.query("UPDATE stock_transfers SET status = 'cancelled' WHERE transfer_id = ?", [t.transfer_id]);
    await audit(conn, { table: "stock_transfers", recordId: t.transfer_id, action: "CANCEL", oldValue: { status: t.status }, newValue: { status: "cancelled" }, userId: req.user.id });
  });
  res.json({ data: await getTransfer(req.params.id) });
}));

/** Complete without a shipment (e.g. hand-carried): moves the stock immediately. */
router.post("/:id/complete", authorize(ROLES.MANAGER), asyncHandler(async (req, res) => {
  await withTransaction((conn) => completeTransfer(conn, req.params.id, req.user.id));
  res.json({ data: await getTransfer(req.params.id) });
}));

export default router;
