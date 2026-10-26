import { Router } from "express";
import { pool } from "../config/db.js";
import { asyncHandler } from "./asyncHandler.js";
import { httpError } from "./httpError.js";
import { pick, paging, requireFields } from "./helpers.js";
import { audit } from "./audit.js";
import { authenticate, authorize } from "../middleware/auth.js";

/**
 * Generic CRUD router for simple tables.
 * cfg: table, pk, fields (writable), required, search (columns, prefixed with t.),
 *      filters (equality query params), columns, joins, orderBy, writeRoles, softDelete (column name)
 */
export function crudRouter(cfg) {
  const {
    table, pk, fields, required = [], search = [], filters = [],
    columns = "t.*", joins = "", orderBy = `t.${pk} DESC`,
    writeRoles = [], softDelete = null,
  } = cfg;
  const router = Router();
  const selectSql = `SELECT ${columns} FROM ${table} t ${joins}`;
  const countSql = `SELECT COUNT(*) AS total FROM ${table} t ${joins}`;
  router.use(authenticate);

  const getOne = async (id, conn = pool) => {
    const [rows] = await conn.query(`${selectSql} WHERE t.${pk} = ?`, [id]);
    return rows[0] || null;
  };

  router.get("/", asyncHandler(async (req, res) => {
    const where = [], params = [];
    for (const f of filters) {
      if (req.query[f] !== undefined && req.query[f] !== "") { where.push(`t.${f} = ?`); params.push(req.query[f]); }
    }
    if (req.query.q && search.length) {
      where.push(`(${search.map((s) => `${s} LIKE ?`).join(" OR ")})`);
      search.forEach(() => params.push(`%${req.query.q}%`));
    }
    const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const { page, limit, offset } = paging(req.query);
    const [rows] = await pool.query(`${selectSql}${w} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [...params, limit, offset]);
    const [[{ total }]] = await pool.query(`${countSql}${w}`, params);
    res.json({ data: rows, meta: { page, limit, total } });
  }));

  router.get("/:id", asyncHandler(async (req, res) => {
    const row = await getOne(req.params.id);
    if (!row) throw httpError(404, `${table} record not found`);
    res.json({ data: row });
  }));

  router.post("/", authorize(...writeRoles), asyncHandler(async (req, res) => {
    requireFields(req.body, required);
    const data = pick(req.body, fields);
    const [result] = await pool.query(`INSERT INTO ${table} SET ?`, [data]);
    const row = await getOne(result.insertId);
    await audit(pool, { table, recordId: result.insertId, action: "INSERT", newValue: row, userId: req.user.id });
    res.status(201).json({ data: row });
  }));

  router.put("/:id", authorize(...writeRoles), asyncHandler(async (req, res) => {
    const before = await getOne(req.params.id);
    if (!before) throw httpError(404, `${table} record not found`);
    const data = pick(req.body, fields);
    if (!Object.keys(data).length) throw httpError(400, "No updatable fields supplied");
    await pool.query(`UPDATE ${table} SET ? WHERE ${pk} = ?`, [data, req.params.id]);
    const after = await getOne(req.params.id);
    await audit(pool, { table, recordId: Number(req.params.id), action: "UPDATE", oldValue: before, newValue: after, userId: req.user.id });
    res.json({ data: after });
  }));

  router.delete("/:id", authorize(...writeRoles), asyncHandler(async (req, res) => {
    const before = await getOne(req.params.id);
    if (!before) throw httpError(404, `${table} record not found`);
    if (softDelete) await pool.query(`UPDATE ${table} SET ${softDelete} = 0 WHERE ${pk} = ?`, [req.params.id]);
    else await pool.query(`DELETE FROM ${table} WHERE ${pk} = ?`, [req.params.id]);
    await audit(pool, { table, recordId: Number(req.params.id), action: softDelete ? "DEACTIVATE" : "DELETE", oldValue: before, userId: req.user.id });
    res.json({ message: softDelete ? "Record deactivated" : "Record deleted" });
  }));

  return router;
}
