import { Router } from "express";
import { pool } from "../config/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";
import { paging } from "../utils/helpers.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize, ROLES } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

const SELECT = `SELECT a.*, p.sku, p.product_name, b.branch_name
                  FROM low_stock_alerts a JOIN products p ON p.product_id = a.product_id JOIN branches b ON b.branch_id = a.branch_id`;

router.get("/", asyncHandler(async (req, res) => {
  const where = [], params = [];
  if (req.query.status) { where.push("a.status = ?"); params.push(req.query.status); }
  if (req.query.branch_id) { where.push("a.branch_id = ?"); params.push(req.query.branch_id); }
  if (req.query.product_id) { where.push("a.product_id = ?"); params.push(req.query.product_id); }
  const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const { page, limit, offset } = paging(req.query);
  const [rows] = await pool.query(`${SELECT}${w} ORDER BY a.alert_id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM low_stock_alerts a${w}`, params);
  res.json({ data: rows, meta: { page, limit, total } });
}));

/** Manually dismiss an alert (it is also auto-resolved when stock recovers). */
router.patch("/:id/resolve", authorize(ROLES.MANAGER, ROLES.COORDINATOR), asyncHandler(async (req, res) => {
  const [rows] = await pool.query("SELECT * FROM low_stock_alerts WHERE alert_id = ?", [req.params.id]);
  if (!rows[0]) throw httpError(404, "Alert not found");
  await pool.query("UPDATE low_stock_alerts SET status = 'resolved', resolved_at = NOW() WHERE alert_id = ? AND status = 'open'", [req.params.id]);
  await audit(pool, { table: "low_stock_alerts", recordId: rows[0].alert_id, action: "RESOLVE", oldValue: { status: rows[0].status }, newValue: { status: "resolved" }, userId: req.user.id });
  const [out] = await pool.query(`${SELECT} WHERE a.alert_id = ?`, [req.params.id]);
  res.json({ data: out[0] });
}));

export default router;
