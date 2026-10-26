import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { pool } from "../config/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";
import { requireFields } from "../utils/helpers.js";
import { authenticate, signToken } from "../middleware/auth.js";
import { audit } from "../utils/audit.js";

const router = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." } });

const USER_SQL = `SELECT u.user_id, u.first_name, u.middle_name, u.last_name, u.email, u.password_hash, u.is_active,
                         u.branch_id, r.role_name, b.branch_name
                    FROM users u JOIN roles r ON r.role_id = u.role_id
               LEFT JOIN branches b ON b.branch_id = u.branch_id`;

const publicUser = (u) => ({
  id: u.user_id, name: `${u.first_name} ${u.last_name}`, firstName: u.first_name, lastName: u.last_name,
  email: u.email, role: u.role_name, branchId: u.branch_id, branchName: u.branch_name ?? null,
});

router.post("/login", loginLimiter, asyncHandler(async (req, res) => {
  requireFields(req.body, ["email", "password"]);
  const [rows] = await pool.query(`${USER_SQL} WHERE u.email = ?`, [String(req.body.email).trim().toLowerCase()]);
  const user = rows[0];
  const ok = user && user.is_active && (await bcrypt.compare(String(req.body.password), user.password_hash));
  if (!ok) throw httpError(401, "Invalid email or password");
  await audit(pool, { table: "users", recordId: user.user_id, action: "LOGIN", userId: user.user_id });
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.get("/me", authenticate, asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`${USER_SQL} WHERE u.user_id = ?`, [req.user.id]);
  if (!rows[0] || !rows[0].is_active) throw httpError(401, "Account is no longer active");
  res.json({ user: publicUser(rows[0]) });
}));

router.post("/change-password", authenticate, asyncHandler(async (req, res) => {
  requireFields(req.body, ["currentPassword", "newPassword"]);
  if (String(req.body.newPassword).length < 8) throw httpError(400, "New password must be at least 8 characters");
  const [rows] = await pool.query("SELECT password_hash FROM users WHERE user_id = ?", [req.user.id]);
  if (!rows[0] || !(await bcrypt.compare(req.body.currentPassword, rows[0].password_hash))) throw httpError(401, "Current password is incorrect");
  await pool.query("UPDATE users SET password_hash = ? WHERE user_id = ?", [await bcrypt.hash(req.body.newPassword, 10), req.user.id]);
  await audit(pool, { table: "users", recordId: req.user.id, action: "PASSWORD_CHANGE", userId: req.user.id });
  res.json({ message: "Password updated" });
}));

export default router;
