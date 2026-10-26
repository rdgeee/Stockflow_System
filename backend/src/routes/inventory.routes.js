import { Router } from "express";
import { pool, withTransaction } from "../config/db.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";
import { paging, requireFields, toPositiveInt } from "../utils/helpers.js";
import { audit } from "../utils/audit.js";
import { authenticate, authorize, ROLES } from "../middleware/auth.js";
import { changeStock, evaluateLowStock } from "../services/inventoryService.js";

const router = Router();
router.use(authenticate);

const SELECT = `SELECT i.inventory_id, i.branch_id, i.product_id, i.quantity_on_hand, i.reorder_threshold_override, i.last_updated,
                       p.sku, p.product_name, p.category, p.unit_price, b.branch_name, b.branch_code,
                       COALESCE(i.reorder_threshold_override, p.reorder_threshold, 0) AS threshold,
                       CASE WHEN i.quantity_on_hand = 0 THEN 'Out of stock'
                            WHEN i.quantity_on_hand <= COALESCE(i.reorder_threshold_override, p.reorder_threshold, 0) THEN 'Low stock'
                            ELSE 'In stock' END AS stock_status
                  FROM inventory i JOIN products p ON p.product_id = i.product_id
                  JOIN branches b ON b.branch_id = i.branch_id`;
const COUNT = `SELECT COUNT(*) AS total FROM inventory i JOIN products p ON p.product_id = i.product_id JOIN branches b ON b.branch_id = i.branch_id`;
const canWrite = authorize(ROLES.MANAGER);

router.get("/", asyncHandler(async (req, res) => {
  const where = [], params = [];
  if (req.query.branch_id) { where.push("i.branch_id = ?"); params.push(req.query.branch_id); }
  if (req.query.product_id) { where.push("i.product_id = ?"); params.push(req.query.product_id); }
  if (req.query.category) { where.push("p.category = ?"); params.push(req.query.category); }
  if (req.query.low === "1" || req.query.low === "true") where.push("i.quantity_on_hand <= COALESCE(i.reorder_threshold_override, p.reorder_threshold, 0)");
  if (req.query.q) { where.push("(p.sku LIKE ? OR p.product_name LIKE ? OR b.branch_name LIKE ?)"); params.push(...Array(3).fill(`%${req.query.q}%`)); }
  const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
  const { page, limit, offset } = paging(req.query);
  const [rows] = await pool.query(`${SELECT}${w} ORDER BY b.branch_name, p.product_name LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const [[{ total }]] = await pool.query(`${COUNT}${w}`, params);
  res.json({ data: rows, meta: { page, limit, total } });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const [rows] = await pool.query(`${SELECT} WHERE i.inventory_id = ?`, [req.params.id]);
  if (!rows[0]) throw httpError(404, "Inventory record not found");
  res.json({ data: rows[0] });
}));

/** Add/remove stock: { branch_id, product_id, delta, reason }  (delta can be negative) */
router.post("/adjust", canWrite, asyncHandler(async (req, res) => {
  requireFields(req.body, ["branch_id", "product_id", "delta"]);
  const delta = Number(req.body.delta);
  if (!Number.isInteger(delta) || delta === 0) throw httpError(400, "delta must be a non-zero whole number");
  const result = await withTransaction((conn) => changeStock(conn, {
    branchId: toPositiveInt(req.body.branch_id, "branch_id"), productId: toPositiveInt(req.body.product_id, "product_id"),
    delta, userId: req.user.id, reason: req.body.reason || "Manual adjustment",
  }));
  res.json({ data: result });
}));

/** Create the inventory row (if needed) and set an exact quantity / threshold override. */
router.post("/", canWrite, asyncHandler(async (req, res) => {
  requireFields(req.body, ["branch_id", "product_id", "quantity_on_hand"]);
  const qty = Number(req.body.quantity_on_hand);
  if (!Number.isInteger(qty) || qty < 0) throw httpError(400, "quantity_on_hand must be a whole number >= 0");
  const id = await withTransaction(async (conn) => {
    const { inventoryId, before } = await changeStock(conn, { branchId: Number(req.body.branch_id), productId: Number(req.body.product_id), delta: 0, userId: req.user.id });
    const [[current]] = await conn.query("SELECT quantity_on_hand FROM inventory WHERE inventory_id = ?", [inventoryId]);
    await changeStock(conn, { branchId: Number(req.body.branch_id), productId: Number(req.body.product_id), delta: qty - current.quantity_on_hand, userId: req.user.id, reason: "Stock count set" });
    if (req.body.reorder_threshold_override !== undefined) {
      await conn.query("UPDATE inventory SET reorder_threshold_override = ? WHERE inventory_id = ?", [req.body.reorder_threshold_override, inventoryId]);
      await evaluateLowStock(conn, Number(req.body.branch_id), Number(req.body.product_id));
    }
    return inventoryId;
  });
  const [rows] = await pool.query(`${SELECT} WHERE i.inventory_id = ?`, [id]);
  res.status(201).json({ data: rows[0] });
}));

/** Update the per-branch reorder threshold override ({ reorder_threshold_override: number|null }). */
router.put("/:id", canWrite, asyncHandler(async (req, res) => {
  requireFields({ v: req.body.reorder_threshold_override === null ? 0 : req.body.reorder_threshold_override }, ["v"]);
  const [rows] = await pool.query("SELECT * FROM inventory WHERE inventory_id = ?", [req.params.id]);
  if (!rows[0]) throw httpError(404, "Inventory record not found");
  await withTransaction(async (conn) => {
    await conn.query("UPDATE inventory SET reorder_threshold_override = ?, last_updated = NOW() WHERE inventory_id = ?", [req.body.reorder_threshold_override, req.params.id]);
    await evaluateLowStock(conn, rows[0].branch_id, rows[0].product_id);
    await audit(conn, { table: "inventory", recordId: rows[0].inventory_id, action: "UPDATE", oldValue: { reorder_threshold_override: rows[0].reorder_threshold_override }, newValue: { reorder_threshold_override: req.body.reorder_threshold_override }, userId: req.user.id });
  });
  const [out] = await pool.query(`${SELECT} WHERE i.inventory_id = ?`, [req.params.id]);
  res.json({ data: out[0] });
}));

export default router;
