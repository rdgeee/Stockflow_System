import { httpError } from "../utils/httpError.js";
import { audit } from "../utils/audit.js";
import { changeStock } from "./inventoryService.js";

/** Receive a purchase order: add every line item to the destination branch's inventory. */
export async function receivePurchaseOrder(conn, poId, userId) {
  const [rows] = await conn.query("SELECT * FROM purchase_orders WHERE po_id = ? FOR UPDATE", [poId]);
  if (!rows.length) throw httpError(404, "Purchase order not found");
  const po = rows[0];
  if (["received", "cancelled"].includes(po.status)) {
    throw httpError(409, `Purchase order is already ${po.status}`);
  }
  const [items] = await conn.query("SELECT product_id, quantity FROM purchase_order_items WHERE po_id = ?", [poId]);
  for (const it of items) {
    await changeStock(conn, { branchId: po.branch_id, productId: it.product_id, delta: it.quantity, userId, reason: `PO #${poId} received` });
  }
  await conn.query("UPDATE purchase_orders SET status = 'received' WHERE po_id = ?", [poId]);
  await audit(conn, { table: "purchase_orders", recordId: poId, action: "RECEIVE", oldValue: { status: po.status }, newValue: { status: "received" }, userId });
}
