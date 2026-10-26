function statusClass(value) {
  return `status-${String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
}

/** `renderActions(row)` (optional) adds a right-hand ACTIONS column. */
export default function DataTable({ columns, rows, emptyMessage = "No matching records found.", renderActions }) {
  const span = columns.length + (renderActions ? 1 : 0);
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">{column.label}</th>
            ))}
            {renderActions && <th scope="col" className="actions-col">ACTIONS</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => {
                  const value = row[column.key];
                  return (
                    <td key={column.key}>
                      {column.render ? column.render(value, row) : column.status ? (
                        <span className={`status ${statusClass(value)}`}>{value}</span>
                      ) : value}
                    </td>
                  );
                })}
                {renderActions && <td className="actions-cell">{renderActions(row)}</td>}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={span} className="empty-cell">{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
