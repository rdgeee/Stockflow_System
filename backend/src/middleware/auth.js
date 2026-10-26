import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { httpError } from "../utils/httpError.js";

export const ROLES = {
  ADMIN: "admin",
  MANAGER: "branch_manager",
  COORDINATOR: "procurement_coordinator",
  DRIVER: "driver",
};

export function signToken(user) {
  return jwt.sign(
    { sub: user.user_id, role: user.role_name, branchId: user.branch_id ?? null, name: `${user.first_name} ${user.last_name}` },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );
}

export function authenticate(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next(httpError(401, "Authentication required"));
  try {
    const p = jwt.verify(token, env.jwtSecret);
    req.user = { id: p.sub, role: p.role, branchId: p.branchId, name: p.name };
    next();
  } catch {
    next(httpError(401, "Invalid or expired token"));
  }
}

/** Admin always passes; otherwise the user's role must be listed. No roles listed = admin only. */
export const authorize = (...roles) => (req, _res, next) => {
  if (req.user.role === ROLES.ADMIN || roles.includes(req.user.role)) return next();
  next(httpError(403, "You do not have permission to perform this action"));
};
