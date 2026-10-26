import { httpError } from "../utils/httpError.js";
import { audit } from "../utils/audit.js";

/** Open or resolve a low-stock alert depending on current quantity vs threshold. */
export async function evaluateLowStock(conn, branchId, productId) {
  const [rows] = await conn.query(
    `SELECT i.quantity_on_hand AS qty,
            COALESCE(i.reorder_threshold_override, p.reorder_threshold, 0) AS threshold
       FROM inventory i JOIN products p ON p.product_id = i.product_id
      WHERE i.branch_id = ? AND i.product_id = ?`,
    [branchId, productId],
  );
  const row = rows[0];
  if (!row) return;
  const [open] = await conn.query(
    "SELECT alert_id FROM low_stock_alerts WHERE branch_id = ? AND product_id = ? AND status = 'open'",
    [branchId, productId],
  );
  if (row.qty <= row.threshold) {
    if (!open.length) {
      await conn.query(
        `INSERT INTO low_stock_alerts (product_id, branch_id, threshold_at_trigger, quantity_at_trigger, status)
         VALUES (?,?,?,?, 'open')`,
        [productId, branchId, row.threshold, row.qty],
      );
    }
  } else if (open.length) {
    await conn.query(
      "UPDATE low_stock_alerts SET status = 'resolved', resolved_at = NOW() WHERE branch_id = ? AND product_id = ? AND status = 'open'",
      [branchId, productId],
    );
  }
}

/**
 * Add (delta > 0) or remove (delta < 0) stock for a product at a branch.
 * Must run inside a transaction (pass the transaction connection).
 */
export async function changeStock(conn, { branchId, productId, delta, userId = null, reason = null }) {
  const [rows] = await conn.query(
    "SELECT inventory_id, quantity_on_hand FROM inventory WHERE branch_id = ? AND product_id = ? FOR UPDATE",
    [branchId, productId],
  );
  let inventoryId;
  let before = 0;
  if (!rows.length) {
    if (delta < 0) throw httpError(409, `Insufficient stock: product ${productId} has no stock at branch ${branchId}`);
    const [ins] = await conn.query(
      "INSERT INTO inventory (branch_id, product_id, quantity_on_hand) VALUES (?,?,0)",
      [branchId, productId],
    );
    inventoryId = ins.insertId;
  } else {
    inventoryId = rows[0].inventory_id;
    before = rows[0].quantity_on_hand;
  }
  const after = before + delta;
  if (after < 0) {
    throw httpError(409, `Insufficient stock for product ${productId} at branch ${branchId}: ${before} on hand, ${Math.abs(delta)} requested`);
  }
  await conn.query("UPDATE inventory SET quantity_on_hand = ?, last_updated = NOW() WHERE inventory_id = ?", [after, inventoryId]);
  if (delta !== 0) {
    await audit(conn, {
      table: "inventory",
      recordId: inventoryId,
      action: delta > 0 ? "STOCK_IN" : "STOCK_OUT",
      oldValue: { quantity: before },
      newValue: { quantity: after, delta: Math.abs(delta), reason, branch_id: branchId, product_id: productId },
      userId,
    });
  }
  await evaluateLowStock(conn, branchId, productId);
  return { inventoryId, before, after };
}
