import { Router } from "express";
import { pool } from "../config/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { paging } from "../utils/helpers.js";
import { authenticate, authorize } from "../middleware/auth.js";

const router = Router();
router.use(authenticate, authorize()); // admin only

router.get("/", asyncHandler(async (req, res) => {
  const where = [], params = [];
  for (const f of ["table_name", "record_id", "action", "changed_by"]) {
    if (req.query[f]) { where.push(`a.${f} = ?`); params.push(req.query[f]); }
  }
  const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const { page, limit, offset } = paging(req.query);
  const [rows] = await pool.query(
    `SELECT a.*, CONCAT_WS(' ', u.first_name, u.last_name) AS changed_by_name
       FROM audit_logs a LEFT JOIN users u ON u.user_id = a.changed_by${w} ORDER BY a.audit_id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM audit_logs a${w}`, params);
  res.json({ data: rows, meta: { page, limit, total } });
}));

export default router;
