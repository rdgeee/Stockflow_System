import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../config/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";
import { pick, paging, requireFields } from "../utils/helpers.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize, ROLES } from "../middleware/auth.js";

const router = Router();
router.use(authenticate);

const SELECT = `SELECT u.user_id, u.role_id, u.branch_id, u.first_name, u.middle_name, u.last_name,
                       CONCAT_WS(' ', u.first_name, u.middle_name, u.last_name) AS full_name,
                       u.email, u.is_active, u.created_at, r.role_name, b.branch_name
                  FROM users u JOIN roles r ON r.role_id = u.role_id
             LEFT JOIN branches b ON b.branch_id = u.branch_id`;
const COUNT = `SELECT COUNT(*) AS total FROM users u JOIN roles r ON r.role_id = u.role_id`;
const WRITABLE = ["role_id", "branch_id", "first_name", "middle_name", "last_name", "email", "is_active"];

const getOne = async (id) => (await pool.query(`${SELECT} WHERE u.user_id = ?`, [id]))[0][0] || null;

// Managers need to see users (e.g. to pick drivers); only admins can change them.
router.get("/", authorize(ROLES.MANAGER, ROLES.COORDINATOR), asyncHandler(async (req, res) => {
  const where = [], params = [];
  if (req.query.role) { where.push("r.role_name = ?"); params.push(req.query.role); }
  if (req.query.branch_id) { where.push("u.branch_id = ?"); params.push(req.query.branch_id); }
  if (req.query.is_active !== undefined && req.query.is_active !== "") { where.push("u.is_active = ?"); params.push(req.query.is_active === "true" || req.query.is_active === "1" ? 1 : 0); }
  if (req.query.q) {
    where.push("(u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)");
    params.push(...Array(3).fill(`%${req.query.q}%`));
  }
  const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const { page, limit, offset } = paging(req.query);
  const [rows] = await pool.query(`${SELECT}${w} ORDER BY u.user_id DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [[{ total }]] = await pool.query(`${COUNT}${w}`, params);
  res.json({ data: rows, meta: { page, limit, total } });
}));

router.get("/:id", authorize(ROLES.MANAGER, ROLES.COORDINATOR), asyncHandler(async (req, res) => {
  const row = await getOne(req.params.id);
  if (!row) throw httpError(404, "User not found");
  res.json({ data: row });
}));

router.post("/", authorize(), asyncHandler(async (req, res) => {
  requireFields(req.body, ["role_id", "first_name", "last_name", "email", "password"]);
  if (String(req.body.password).length < 8) throw httpError(400, "Password must be at least 8 characters");
  const data = pick(req.body, WRITABLE);
  data.email = String(data.email).trim().toLowerCase();
  data.password_hash = await bcrypt.hash(String(req.body.password), 10);
  const [result] = await pool.query("INSERT INTO users SET ?", [data]);
  const row = await getOne(result.insertId);
  await audit(pool, { table: "users", recordId: result.insertId, action: "INSERT", newValue: row, userId: req.user.id });
  res.status(201).json({ data: row });
}));

router.put("/:id", authorize(), asyncHandler(async (req, res) => {
  const before = await getOne(req.params.id);
  if (!before) throw httpError(404, "User not found");
  const data = pick(req.body, WRITABLE);
  if (data.email) data.email = String(data.email).trim().toLowerCase();
  if (req.body.password) {
    if (String(req.body.password).length < 8) throw httpError(400, "Password must be at least 8 characters");
    data.password_hash = await bcrypt.hash(String(req.body.password), 10);
  }
  if (!Object.keys(data).length) throw httpError(400, "No updatable fields supplied");
  await pool.query("UPDATE users SET ? WHERE user_id = ?", [data, req.params.id]);
  const after = await getOne(req.params.id);
  await audit(pool, { table: "users", recordId: Number(req.params.id), action: "UPDATE", oldValue: before, newValue: after, userId: req.user.id });
  res.json({ data: after });
}));

router.delete("/:id", authorize(), asyncHandler(async (req, res) => {
  if (Number(req.params.id) === req.user.id) throw httpError(400, "You cannot deactivate your own account");
  const before = await getOne(req.params.id);
  if (!before) throw httpError(404, "User not found");
  await pool.query("UPDATE users SET is_active = 0 WHERE user_id = ?", [req.params.id]);
  await audit(pool, { table: "users", recordId: Number(req.params.id), action: "DEACTIVATE", oldValue: before, userId: req.user.id });
  res.json({ message: "User deactivated" });
}));

export default router;
