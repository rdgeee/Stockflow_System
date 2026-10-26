/** Write a row to audit_logs. `conn` can be the pool or a transaction connection. */
export async function audit(conn, { table, recordId = null, action, oldValue = null, newValue = null, userId = null }) {
  const ser = (v) => (v === null || v === undefined ? null : typeof v === "string" ? v : JSON.stringify(v));
  await conn.query(
    "INSERT INTO audit_logs (table_name, record_id, action, old_value, new_value, changed_by) VALUES (?,?,?,?,?,?)",
    [table, recordId, action, ser(oldValue), ser(newValue), userId],
  );
}
