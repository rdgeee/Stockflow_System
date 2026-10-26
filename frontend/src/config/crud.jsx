// What you can DO on each page: the "Add" button, the per-row buttons, the forms, and which API call each one makes.
// `roles` lists who may see the button (admin always can; omit `roles` to allow everyone; [] = admin only).
// The server enforces the same rules, so this only decides what is shown.
import { api } from "../api/client.js";

export const ROLE = { MANAGER: "branch_manager", COORDINATOR: "procurement_coordinator", DRIVER: "driver" };
const { MANAGER: M, COORDINATOR: C, DRIVER: D } = ROLE;

export const allowed = (user, roles) => !roles || user?.role === "admin" || roles.includes(user?.role);

// ---------- small helpers ----------
const label = (s) => (s ? String(s).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "—");
const pad = (prefix, n) => `${prefix}-${String(n).padStart(4, "0")}`;
const money = (n) => `₱${Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (v) => (v ? new Date(v).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—");
const text = (v) => (typeof v === "string" ? v.trim() : v);
const nul = (v) => (v === "" || v === undefined || v === null ? null : text(v));
const numOrNull = (v) => (v === "" || v === undefined || v === null ? null : Number(v));
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== ""));
const toLocalInput = (v) => {
  if (!v) return "";
  const d = new Date(v);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const post = (path, body) => api(path, { method: "POST", body });
const put = (path, body) => api(path, { method: "PUT", body });
const patch = (path, body) => api(path, { method: "PATCH", body });
const del = (path) => api(path, { method: "DELETE" });
const items = (v) => v.items.map((i) => ({ product_id: Number(i.product_id), quantity: Number(i.quantity) }));

// dropdown sources
const from = (endpoint, value, lab, filter) => ({ endpoint, value, label: lab, filter });
const BRANCHES = from("/branches?is_active=1&limit=500", "branch_id", (r) => `${r.branch_name} (${r.branch_code})`);
const PRODUCTS = from("/products?is_active=1&limit=500", "product_id", (r) => `${r.sku} — ${r.product_name}`);
const SUPPLIERS = from("/suppliers?is_active=1&limit=500", "supplier_id", (r) => r.supplier_name);
const DRIVERS = from("/users?role=driver&is_active=1&limit=500", "user_id", (r) => r.full_name);
const ROLES = from("/roles", "role_id", (r) => label(r.role_name));
const DRIVER_ROLE = from("/roles", "role_id", (r) => label(r.role_name), (r) => r.role_name === "driver");
const VEHICLES = from("/vehicles?limit=500", "vehicle_id", (r) => `${r.plate_number} · ${r.vehicle_type ?? "Vehicle"} (${r.status})`);
const ROUTES = from("/routes?limit=500", "route_id", (r) => r.route_name);
const APPROVED_TRANSFERS = from("/transfers?status=approved&limit=500", "transfer_id", (r) => `${pad("TR", r.transfer_id)} · ${r.from_branch} → ${r.to_branch}`);
const ORDERED_POS = from("/purchase-orders?status=ordered&limit=500", "po_id", (r) => `${pad("PO", r.po_id)} · ${r.branch_name} (${r.total_quantity} units)`);

const itemsTable = (rows, withPrice) => (
  <table className="data-table detail-table">
    <thead><tr><th>SKU</th><th>PRODUCT</th><th>QTY</th>{withPrice && <><th>UNIT PRICE</th><th>LINE TOTAL</th></>}</tr></thead>
    <tbody>
      {rows.map((i) => (
        <tr key={i.product_id}><td>{i.sku}</td><td>{i.product_name}</td><td>{i.quantity}</td>
          {withPrice && <><td>{money(i.unit_price)}</td><td>{money(i.line_total)}</td></>}</tr>
      ))}
    </tbody>
  </table>
);
const facts = (pairs) => (
  <dl className="detail-facts">
    {pairs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v ?? "—"}</dd></div>)}
  </dl>
);

// ---------- field sets ----------
const productFields = [
  { name: "sku", label: "SKU", required: true, placeholder: "e.g. PKG-BOX-S" },
  { name: "product_name", label: "Product name", required: true },
  { name: "category", label: "Category", placeholder: "e.g. Packaging" },
  { name: "unit_price", label: "Unit price (₱)", type: "number", min: "0", step: "0.01", required: true },
  { name: "reorder_threshold", label: "Reorder when stock reaches", type: "number", min: "0", step: "1", required: true },
  { name: "description", label: "Description", type: "textarea" },
];
const productBody = (v) => ({
  sku: text(v.sku), product_name: text(v.product_name), category: nul(v.category), description: nul(v.description),
  unit_price: Number(v.unit_price), reorder_threshold: Number(v.reorder_threshold),
});
const productInitial = (r) => ({ sku: r.sku, product_name: r.product_name, category: r.category ?? "", description: r.description ?? "", unit_price: r.unit_price, reorder_threshold: r.reorder_threshold });

const branchFields = [
  { name: "branch_code", label: "Branch code", required: true, placeholder: "e.g. TAG-02" },
  { name: "branch_name", label: "Branch name", required: true },
  { name: "street", label: "Street" },
  { name: "barangay", label: "Barangay" },
  { name: "city", label: "City" },
  { name: "postal_code", label: "Postal code" },
  { name: "contact_number", label: "Contact number" },
];
const branchBody = (v) => ({
  branch_code: text(v.branch_code), branch_name: text(v.branch_name), street: nul(v.street), barangay: nul(v.barangay),
  city: nul(v.city), postal_code: nul(v.postal_code), contact_number: nul(v.contact_number),
});
const branchInitial = (r) => ({ branch_code: r.branch_code, branch_name: r.branch_name, street: r.street ?? "", barangay: r.barangay ?? "", city: r.city ?? "", postal_code: r.postal_code ?? "", contact_number: r.contact_number ?? "" });

const supplierFields = [
  { name: "supplier_name", label: "Supplier name", required: true, wide: true },
  { name: "contact_person", label: "Contact person" },
  { name: "phone", label: "Phone" },
  { name: "email", label: "Email", type: "email", wide: true },
  { name: "address", label: "Address", wide: true },
];
const supplierBody = (v) => ({ supplier_name: text(v.supplier_name), contact_person: nul(v.contact_person), email: nul(v.email), phone: nul(v.phone), address: nul(v.address) });

const vehicleFields = [
  { name: "plate_number", label: "Plate number", required: true, placeholder: "e.g. NAB 1234" },
  { name: "vehicle_type", label: "Vehicle type", placeholder: "e.g. Closed Van" },
  { name: "capacity", label: "Capacity (kg)", type: "number", min: "0", step: "any" },
  { name: "status", label: "Status", type: "select", required: true, options: [{ value: "available", label: "Available" }, { value: "in_use", label: "In use" }, { value: "maintenance", label: "Maintenance" }] },
  { name: "driver_user_id", label: "Assigned driver", type: "select", optional: true, optionsFrom: DRIVERS },
];
const vehicleBody = (v) => ({ plate_number: text(v.plate_number), vehicle_type: nul(v.vehicle_type), capacity: numOrNull(v.capacity), status: v.status, driver_user_id: numOrNull(v.driver_user_id) });

const userFields = ({ editing = false, driverOnly = false } = {}) => [
  { name: "first_name", label: "First name", required: true },
  { name: "middle_name", label: "Middle name" },
  { name: "last_name", label: "Last name", required: true },
  { name: "email", label: "Email address", type: "email", required: true },
  driverOnly
    ? { name: "role_id", label: "Role", type: "select", hidden: true, autoSelect: true, optionsFrom: DRIVER_ROLE }
    : { name: "role_id", label: "Role", type: "select", required: true, optionsFrom: ROLES },
  { name: "branch_id", label: "Branch", type: "select", optional: true, optionsFrom: BRANCHES },
  editing
    ? { name: "password", label: "New password", type: "password", minLength: 8, help: "Leave blank to keep the current password." }
    : { name: "password", label: "Password", type: "password", required: true, minLength: 8, help: "At least 8 characters." },
];
const userBody = (v) => compact({
  first_name: text(v.first_name), last_name: text(v.last_name), email: text(v.email), role_id: Number(v.role_id),
  password: v.password || undefined,
});
const userFull = (v) => ({ ...userBody(v), middle_name: nul(v.middle_name), branch_id: numOrNull(v.branch_id) });
const userInitial = (r) => ({ first_name: r.first_name, middle_name: r.middle_name ?? "", last_name: r.last_name, email: r.email, role_id: String(r.role_id), branch_id: r.branch_id ? String(r.branch_id) : "", password: "" });

const userActions = (noun) => [
  { label: "Edit", roles: [], success: `${noun} updated`,
    form: { title: (r) => `Edit ${r.full_name}`, fields: () => userFields({ editing: true, driverOnly: noun === "Driver" }), initial: userInitial, submit: (v, r) => put(`/users/${r.user_id}`, userFull(v)) } },
  { label: "Deactivate", tone: "danger", roles: [], when: (r) => !!r.is_active, confirm: (r) => `Deactivate ${r.full_name}? They will no longer be able to sign in.`, run: (r) => del(`/users/${r.user_id}`), success: `${noun} deactivated` },
  { label: "Reactivate", roles: [], when: (r) => !r.is_active, run: (r) => put(`/users/${r.user_id}`, { is_active: true }), success: `${noun} reactivated` },
];

// Branch managers may only decide on transfers leaving their own branch.
const canDecide = (user, r) => user.role !== M || !user.branchId || user.branchId === r.from_branch_id;

// ---------- the definitions ----------
export const crud = {
  Products: {
    create: { roles: [M, C], label: "Add product", title: "New product", fields: productFields, submit: (v) => post("/products", productBody(v)), success: "Product added" },
    actions: [
      { label: "Edit", roles: [M, C], success: "Product updated",
        form: { title: (r) => `Edit ${r.product_name}`, fields: productFields, initial: productInitial, submit: (v, r) => put(`/products/${r.product_id}`, productBody(v)) } },
      { label: "Deactivate", tone: "danger", roles: [M, C], when: (r) => !!r.is_active, confirm: (r) => `Deactivate ${r.product_name}? It stays in the database but is hidden from new orders.`, run: (r) => del(`/products/${r.product_id}`), success: "Product deactivated" },
      { label: "Reactivate", roles: [M, C], when: (r) => !r.is_active, run: (r) => put(`/products/${r.product_id}`, { is_active: true }), success: "Product reactivated" },
    ],
  },

  Suppliers: {
    create: { roles: [C], label: "Add supplier", title: "New supplier", fields: supplierFields, submit: (v) => post("/suppliers", supplierBody(v)), success: "Supplier added" },
    actions: [
      { label: "Edit", roles: [C], success: "Supplier updated",
        form: { title: (r) => `Edit ${r.supplier_name}`, fields: supplierFields, initial: (r) => ({ supplier_name: r.supplier_name, contact_person: r.contact_person ?? "", email: r.email ?? "", phone: r.phone ?? "", address: r.address ?? "" }), submit: (v, r) => put(`/suppliers/${r.supplier_id}`, supplierBody(v)) } },
      { label: "Deactivate", tone: "danger", roles: [C], when: (r) => !!r.is_active, confirm: (r) => `Deactivate ${r.supplier_name}? Existing purchase orders keep their supplier.`, run: (r) => del(`/suppliers/${r.supplier_id}`), success: "Supplier deactivated" },
      { label: "Reactivate", roles: [C], when: (r) => !r.is_active, run: (r) => put(`/suppliers/${r.supplier_id}`, { is_active: true }), success: "Supplier reactivated" },
    ],
  },

  Warehouses: {
    create: { roles: [], label: "Add warehouse", title: "New warehouse / branch", fields: branchFields, submit: (v) => post("/branches", branchBody(v)), success: "Warehouse added" },
    actions: [
      { label: "Edit", roles: [], success: "Warehouse updated",
        form: { title: (r) => `Edit ${r.branch_name}`, fields: branchFields, initial: branchInitial, submit: (v, r) => put(`/branches/${r.branch_id}`, branchBody(v)) } },
      { label: "Deactivate", tone: "danger", roles: [], when: (r) => !!r.is_active, confirm: (r) => `Deactivate ${r.branch_name}?`, run: (r) => del(`/branches/${r.branch_id}`), success: "Warehouse deactivated" },
      { label: "Reactivate", roles: [], when: (r) => !r.is_active, run: (r) => put(`/branches/${r.branch_id}`, { is_active: true }), success: "Warehouse reactivated" },
    ],
  },

  Inventory: {
    create: {
      roles: [M], label: "Add stock record", title: "Add stock record", description: "Set the quantity of a product at a branch. Use “Adjust” on a row for later changes.",
      fields: [
        { name: "branch_id", label: "Branch", type: "select", required: true, optionsFrom: BRANCHES },
        { name: "product_id", label: "Product", type: "select", required: true, optionsFrom: PRODUCTS },
        { name: "quantity_on_hand", label: "Quantity on hand", type: "number", min: "0", step: "1", required: true },
        { name: "reorder_threshold_override", label: "Reorder level for this branch", type: "number", min: "0", step: "1", help: "Optional. Leave blank to use the product’s default." },
      ],
      submit: (v) => post("/inventory", {
        branch_id: Number(v.branch_id), product_id: Number(v.product_id), quantity_on_hand: Number(v.quantity_on_hand),
        ...(v.reorder_threshold_override !== "" ? { reorder_threshold_override: Number(v.reorder_threshold_override) } : {}),
      }),
      success: "Stock record saved",
    },
    actions: [
      { label: "Adjust", roles: [M], success: "Stock updated",
        form: {
          title: (r) => `Adjust stock — ${r.product_name}`, description: (r) => `${r.branch_name} · currently ${r.quantity_on_hand} on hand`,
          fields: [
            { name: "direction", label: "Action", type: "select", required: true, options: [{ value: "in", label: "Add stock" }, { value: "out", label: "Remove stock" }] },
            { name: "quantity", label: "Quantity", type: "number", min: "1", step: "1", required: true },
            { name: "reason", label: "Reason", placeholder: "e.g. Damaged goods, stock count", wide: true },
          ],
          initial: () => ({ direction: "in" }),
          submit: (v, r) => post("/inventory/adjust", { branch_id: r.branch_id, product_id: r.product_id, delta: (v.direction === "out" ? -1 : 1) * Number(v.quantity), reason: nul(v.reason) ?? undefined }),
        } },
      { label: "Reorder level", roles: [M], success: "Reorder level updated",
        form: {
          title: (r) => `Reorder level — ${r.product_name}`, description: (r) => `${r.branch_name}`,
          fields: [{ name: "reorder_threshold_override", label: "Alert when stock reaches", type: "number", min: "0", step: "1", help: "Leave blank to use the product default." }],
          initial: (r) => ({ reorder_threshold_override: r.reorder_threshold_override ?? "" }),
          submit: (v, r) => put(`/inventory/${r.inventory_id}`, { reorder_threshold_override: numOrNull(v.reorder_threshold_override) }),
        } },
    ],
  },

  Procurement: {
    create: {
      roles: [C], label: "New purchase order", title: "New purchase order", description: "Unit prices default to each product’s catalog price.",
      fields: [
        { name: "supplier_id", label: "Supplier", type: "select", optional: true, optionsFrom: SUPPLIERS },
        { name: "branch_id", label: "Deliver to", type: "select", required: true, optionsFrom: BRANCHES },
        { name: "expected_date", label: "Expected date", type: "date" },
        { name: "items", label: "Items", type: "items", optionsFrom: PRODUCTS },
      ],
      submit: (v) => post("/purchase-orders", compact({ branch_id: Number(v.branch_id), supplier_id: numOrNull(v.supplier_id), expected_date: v.expected_date, items: items(v) })),
      success: "Purchase order created",
    },
    actions: [
      { label: "View", detail: {
        title: (r) => `Purchase order ${pad("PO", r.po_id)}`, endpoint: (r) => `/purchase-orders/${r.po_id}`,
        render: (d) => (<>{facts([["Status", label(d.status)], ["Supplier", d.supplier_name], ["Deliver to", d.branch_name], ["Coordinator", d.coordinator_name], ["Ordered", fmtDate(d.order_date)], ["Expected", fmtDate(d.expected_date)], ["Total", money(d.total_amount)]])}{itemsTable(d.items, true)}</>),
      } },
      { label: "Mark ordered", roles: [C], when: (r) => r.status === "pending", run: (r) => patch(`/purchase-orders/${r.po_id}/status`, { status: "ordered" }), success: "Marked as ordered" },
      { label: "Receive goods", roles: [C, M], when: (r) => r.status === "ordered", confirm: (r) => `Receive ${pad("PO", r.po_id)}? The items will be added to ${r.branch_name}'s stock.`, run: (r) => post(`/purchase-orders/${r.po_id}/receive`), success: "Goods received — stock updated" },
      { label: "Cancel", tone: "danger", roles: [C], when: (r) => ["pending", "ordered"].includes(r.status), confirm: (r) => `Cancel ${pad("PO", r.po_id)}?`, run: (r) => patch(`/purchase-orders/${r.po_id}/status`, { status: "cancelled" }), success: "Purchase order cancelled" },
    ],
  },

  Orders: {
    create: {
      roles: [M, C], label: "New transfer", title: "New stock transfer", description: "Move stock from one branch to another. The source branch manager must approve it.",
      fields: [
        { name: "from_branch_id", label: "From (source)", type: "select", required: true, optionsFrom: BRANCHES },
        { name: "to_branch_id", label: "To (destination)", type: "select", required: true, optionsFrom: BRANCHES },
        { name: "items", label: "Items", type: "items", optionsFrom: PRODUCTS },
      ],
      submit: (v) => {
        if (v.from_branch_id === v.to_branch_id) throw new Error("Source and destination must be different branches.");
        return post("/transfers", { from_branch_id: Number(v.from_branch_id), to_branch_id: Number(v.to_branch_id), items: items(v) });
      },
      success: "Transfer requested",
    },
    actions: [
      { label: "View", detail: {
        title: (r) => `Transfer ${pad("TR", r.transfer_id)}`, endpoint: (r) => `/transfers/${r.transfer_id}`,
        render: (d) => (<>{facts([["Status", label(d.status)], ["From", d.from_branch], ["To", d.to_branch], ["Requested by", d.requested_by_name], ["Approved by", d.approved_by_name], ["Requested", fmtDate(d.requested_at)]])}{itemsTable(d.items, false)}</>),
      } },
      { label: "Approve", roles: [M], when: (r, u) => r.status === "pending" && canDecide(u, r), confirm: (r) => `Approve ${pad("TR", r.transfer_id)}?`, run: (r) => post(`/transfers/${r.transfer_id}/approve`), success: "Transfer approved" },
      { label: "Reject", tone: "danger", roles: [M], when: (r, u) => r.status === "pending" && canDecide(u, r), confirm: (r) => `Reject ${pad("TR", r.transfer_id)}?`, run: (r) => post(`/transfers/${r.transfer_id}/reject`), success: "Transfer rejected" },
      { label: "Complete", roles: [M], when: (r, u) => ["approved", "in_transit"].includes(r.status) && canDecide(u, r), confirm: (r) => `Complete ${pad("TR", r.transfer_id)}? Stock moves from ${r.from_branch} to ${r.to_branch} right now.`, run: (r) => post(`/transfers/${r.transfer_id}/complete`), success: "Transfer completed — stock moved" },
      { label: "Cancel", tone: "danger", roles: [M, C], when: (r) => ["pending", "approved"].includes(r.status), confirm: (r) => `Cancel ${pad("TR", r.transfer_id)}?`, run: (r) => post(`/transfers/${r.transfer_id}/cancel`), success: "Transfer cancelled" },
    ],
  },

  Distribution: {
    create: {
      roles: [M, C], label: "New shipment", title: "Schedule a shipment", description: "Ship an approved transfer or an ordered purchase order. Delivering it updates stock automatically.",
      fields: [
        { name: "source", label: "Shipment for", type: "select", required: true, options: [{ value: "transfer", label: "Approved stock transfer" }, { value: "po", label: "Ordered purchase order" }] },
        { name: "transfer_id", label: "Transfer", type: "select", required: true, optionsFrom: APPROVED_TRANSFERS, showIf: (v) => v.source === "transfer" },
        { name: "purchase_order_id", label: "Purchase order", type: "select", required: true, optionsFrom: ORDERED_POS, showIf: (v) => v.source === "po" },
        { name: "route_id", label: "Route", type: "select", optional: true, optionsFrom: ROUTES },
        { name: "driver_user_id", label: "Driver", type: "select", optional: true, optionsFrom: DRIVERS },
        { name: "vehicle_id", label: "Vehicle", type: "select", optional: true, optionsFrom: VEHICLES },
        { name: "scheduled_at", label: "Scheduled for", type: "datetime-local" },
      ],
      initial: () => ({ source: "transfer" }),
      submit: (v) => post("/shipments", compact({
        ...(v.source === "transfer" ? { transfer_id: numOrNull(v.transfer_id) } : { purchase_order_id: numOrNull(v.purchase_order_id) }),
        route_id: numOrNull(v.route_id), driver_user_id: numOrNull(v.driver_user_id), vehicle_id: numOrNull(v.vehicle_id), scheduled_at: v.scheduled_at,
      })),
      success: "Shipment scheduled",
    },
    actions: [
      { label: "Start trip", roles: [M, C, D], when: (r) => r.status === "scheduled", run: (r) => patch(`/shipments/${r.shipment_id}/status`, { status: "in_transit" }), success: "Shipment is on its way" },
      { label: "Mark delivered", roles: [M, C, D], when: (r) => r.status === "in_transit", confirm: (r) => `Mark ${r.shipment_number} as delivered? Stock will be updated.`, run: (r) => patch(`/shipments/${r.shipment_id}/status`, { status: "delivered" }), success: "Delivered — stock updated" },
      { label: "Edit", roles: [M, C], when: (r) => r.status === "scheduled", success: "Shipment updated",
        form: {
          title: (r) => `Edit ${r.shipment_number}`,
          fields: [
            { name: "route_id", label: "Route", type: "select", optional: true, optionsFrom: ROUTES },
            { name: "driver_user_id", label: "Driver", type: "select", optional: true, optionsFrom: DRIVERS },
            { name: "vehicle_id", label: "Vehicle", type: "select", optional: true, optionsFrom: VEHICLES },
            { name: "scheduled_at", label: "Scheduled for", type: "datetime-local" },
          ],
          initial: (r) => ({ route_id: r.route_id ? String(r.route_id) : "", driver_user_id: r.driver_user_id ? String(r.driver_user_id) : "", vehicle_id: r.vehicle_id ? String(r.vehicle_id) : "", scheduled_at: toLocalInput(r.scheduled_at) }),
          submit: (v, r) => put(`/shipments/${r.shipment_id}`, { route_id: numOrNull(v.route_id), driver_user_id: numOrNull(v.driver_user_id), vehicle_id: numOrNull(v.vehicle_id), scheduled_at: v.scheduled_at || null }),
        } },
      { label: "Cancel", tone: "danger", roles: [M, C], when: (r) => ["scheduled", "in_transit"].includes(r.status), confirm: (r) => `Cancel ${r.shipment_number}?`, run: (r) => patch(`/shipments/${r.shipment_id}/status`, { status: "cancelled" }), success: "Shipment cancelled" },
    ],
  },

  Vehicles: {
    create: { roles: [M], label: "Add vehicle", title: "New vehicle", fields: vehicleFields, initial: () => ({ status: "available" }), submit: (v) => post("/vehicles", vehicleBody(v)), success: "Vehicle added" },
    actions: [
      { label: "Edit", roles: [M], success: "Vehicle updated",
        form: { title: (r) => `Edit ${r.plate_number}`, fields: vehicleFields, initial: (r) => ({ plate_number: r.plate_number, vehicle_type: r.vehicle_type ?? "", capacity: r.capacity ?? "", status: r.status, driver_user_id: r.driver_user_id ? String(r.driver_user_id) : "" }), submit: (v, r) => put(`/vehicles/${r.vehicle_id}`, vehicleBody(v)) } },
      { label: "Delete", tone: "danger", roles: [M], confirm: (r) => `Delete vehicle ${r.plate_number}? This cannot be undone.`, run: (r) => del(`/vehicles/${r.vehicle_id}`), success: "Vehicle deleted" },
    ],
  },

  Drivers: {
    create: { roles: [], label: "Add driver", title: "New driver account", fields: () => userFields({ driverOnly: true }), submit: (v) => post("/users", userFull(v)), success: "Driver added" },
    actions: userActions("Driver"),
  },

  Users: {
    create: { roles: [], label: "Add user", title: "New user", fields: () => userFields(), submit: (v) => post("/users", userFull(v)), success: "User added" },
    actions: userActions("User"),
  },
};

// Allow `fields` / `title` / `description` / `initial` to be plain values or functions of the row.
export const resolve = (v, ...args) => (typeof v === "function" ? v(...args) : v);
