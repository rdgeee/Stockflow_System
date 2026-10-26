import { httpError } from "../utils/httpError.js";
import { audit } from "../utils/audit.js";
import { changeStock } from "./inventoryService.js";

export async function lockTransfer(conn, transferId) {
  const [rows] = await conn.query("SELECT * FROM stock_transfers WHERE transfer_id = ? FOR UPDATE", [transferId]);
  if (!rows.length) throw httpError(404, "Transfer not found");
  return rows[0];
}

/** Move stock from source to destination branch and mark the transfer completed. */
export async function completeTransfer(conn, transferId, userId) {
  const transfer = await lockTransfer(conn, transferId);
  if (!["approved", "in_transit"].includes(transfer.status)) {
    throw httpError(409, `Only approved transfers can be completed (current status: ${transfer.status})`);
  }
  const [items] = await conn.query("SELECT product_id, quantity FROM stock_transfer_items WHERE transfer_id = ?", [transferId]);
  for (const it of items) {
    await changeStock(conn, { branchId: transfer.from_branch_id, productId: it.product_id, delta: -it.quantity, userId, reason: `Transfer #${transferId} out` });
    await changeStock(conn, { branchId: transfer.to_branch_id, productId: it.product_id, delta: it.quantity, userId, reason: `Transfer #${transferId} in` });
  }
  await conn.query("UPDATE stock_transfers SET status = 'completed', completed_at = NOW() WHERE transfer_id = ?", [transferId]);
  await audit(conn, { table: "stock_transfers", recordId: transferId, action: "COMPLETE", oldValue: { status: transfer.status }, newValue: { status: "completed" }, userId });
}
