// Maps each sidebar page to a backend endpoint, the table columns, and how to shape the API rows.
const label = (s) => (s ? String(s).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "—");
const peso = (n) => `₱${Number(n ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const date = (v) => (v ? new Date(v).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" }) : "—");
const dateTime = (v) => (v ? new Date(v).toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
const pad = (prefix, n) => `${prefix}-${String(n).padStart(4, "0")}`;
const active = (v) => (v ? "Active" : "Inactive");

export const resources = {
  Inventory: {
    endpoint: "/inventory", eyebrow: "STOCK", description: "Quantity on hand for every product at every branch.",
    columns: [
      { key: "sku", label: "SKU" }, { key: "product", label: "PRODUCT" }, { key: "warehouse", label: "BRANCH" },
      { key: "quantity", label: "ON HAND" }, { key: "threshold", label: "REORDER AT" }, { key: "status", label: "STATUS", status: true },
    ],
    map: (r) => ({ id: r.inventory_id, sku: r.sku, product: r.product_name, warehouse: r.branch_name, quantity: r.quantity_on_hand, threshold: r.threshold, status: r.stock_status }),
  },
  Products: {
    endpoint: "/products", eyebrow: "CATALOG", description: "Products tracked across all branches.",
    columns: [
      { key: "sku", label: "SKU" }, { key: "name", label: "PRODUCT" }, { key: "category", label: "CATEGORY" },
      { key: "price", label: "UNIT PRICE" }, { key: "stock", label: "TOTAL STOCK" }, { key: "reorder", label: "REORDER AT" }, { key: "status", label: "STATUS", status: true },
    ],
    map: (r) => ({ id: r.product_id, sku: r.sku, name: r.product_name, category: r.category ?? "—", price: peso(r.unit_price), stock: r.total_stock, reorder: r.reorder_threshold, status: active(r.is_active) }),
  },
  Warehouses: {
    endpoint: "/branches", eyebrow: "LOCATIONS", description: "Branches and warehouses in the network.",
    columns: [
      { key: "code", label: "CODE" }, { key: "name", label: "BRANCH" }, { key: "address", label: "ADDRESS" },
      { key: "contact", label: "CONTACT" }, { key: "units", label: "UNITS IN STOCK" }, { key: "status", label: "STATUS", status: true },
    ],
    map: (r) => ({ id: r.branch_id, code: r.branch_code, name: r.branch_name, address: r.address || "—", contact: r.contact_number ?? "—", units: Number(r.total_units).toLocaleString(), status: active(r.is_active) }),
  },
  Suppliers: {
    endpoint: "/suppliers", eyebrow: "PARTNERS", description: "Companies you buy stock from.",
    columns: [
      { key: "name", label: "SUPPLIER" }, { key: "contact", label: "CONTACT PERSON" }, { key: "email", label: "EMAIL" },
      { key: "phone", label: "PHONE" }, { key: "orders", label: "PURCHASE ORDERS" }, { key: "status", label: "STATUS", status: true },
    ],
    map: (r) => ({ id: r.supplier_id, name: r.supplier_name, contact: r.contact_person ?? "—", email: r.email ?? "—", phone: r.phone ?? "—", orders: r.order_count, status: active(r.is_active) }),
  },
  Procurement: {
    endpoint: "/purchase-orders", eyebrow: "PURCHASING", description: "Purchase orders raised by procurement coordinators.",
    columns: [
      { key: "id", label: "PO" }, { key: "supplier", label: "SUPPLIER" }, { key: "warehouse", label: "DELIVER TO" }, { key: "coordinator", label: "COORDINATOR" },
      { key: "items", label: "ITEMS" }, { key: "amount", label: "TOTAL" }, { key: "ordered", label: "ORDERED" }, { key: "expected", label: "EXPECTED" }, { key: "status", label: "STATUS", status: true },
    ],
    map: (r) => ({ id: pad("PO", r.po_id), supplier: r.supplier_name ?? "—", warehouse: r.branch_name, coordinator: r.coordinator_name, items: `${r.item_count} (${r.total_quantity} units)`, amount: peso(r.total_amount), ordered: date(r.order_date), expected: date(r.expected_date), status: label(r.status) }),
  },
  Orders: {
    endpoint: "/transfers", eyebrow: "SALES & TRANSFERS", description: "Stock transfer orders between branches.",
    columns: [
      { key: "id", label: "REFERENCE" }, { key: "from", label: "FROM" }, { key: "to", label: "TO" }, { key: "units", label: "UNITS" },
      { key: "requestedBy", label: "REQUESTED BY" }, { key: "requested", label: "REQUESTED" }, { key: "status", label: "STATUS", status: true },
    ],
    map: (r) => ({ id: pad("TR", r.transfer_id), from: r.from_branch, to: r.to_branch, units: r.total_quantity, requestedBy: r.requested_by_name, requested: date(r.requested_at), status: label(r.status) }),
  },
  Distribution: {
    endpoint: "/shipments", eyebrow: "LOGISTICS", description: "Shipments for purchase orders and stock transfers.",
    columns: [
      { key: "id", label: "SHIPMENT" }, { key: "route", label: "ROUTE" }, { key: "driver", label: "DRIVER" }, { key: "vehicle", label: "VEHICLE" },
      { key: "scheduled", label: "SCHEDULED" }, { key: "delivered", label: "DELIVERED" }, { key: "status", label: "STATUS", status: true },
    ],
    map: (r) => ({ id: r.shipment_number, route: `${r.origin_name ?? r.supplier_name ?? "Supplier"} → ${r.destination_name ?? "—"}`, driver: r.driver_name || "Unassigned", vehicle: r.plate_number ?? "—", scheduled: dateTime(r.scheduled_at), delivered: dateTime(r.delivered_at), status: label(r.status) }),
  },
  Vehicles: {
    endpoint: "/vehicles", eyebrow: "FLEET", description: "Delivery vehicles and their assigned drivers.",
    columns: [
      { key: "plate", label: "PLATE" }, { key: "type", label: "TYPE" }, { key: "capacity", label: "CAPACITY (KG)" }, { key: "driver", label: "DRIVER" }, { key: "status", label: "STATUS", status: true },
    ],
    map: (r) => ({ id: r.vehicle_id, plate: r.plate_number, type: r.vehicle_type ?? "—", capacity: r.capacity ?? "—", driver: r.driver_name || "Unassigned", status: label(r.status) }),
  },
  Drivers: {
    endpoint: "/users?role=driver", eyebrow: "FLEET", description: "Users with the driver role.",
    columns: [
      { key: "name", label: "NAME" }, { key: "email", label: "EMAIL" }, { key: "branch", label: "BRANCH" }, { key: "status", label: "STATUS", status: true },
    ],
    map: (r) => ({ id: r.user_id, name: r.full_name, email: r.email, branch: r.branch_name ?? "—", status: active(r.is_active) }),
  },
  Users: {
    endpoint: "/users", eyebrow: "ADMINISTRATION", description: "People who can sign in to StockFlow.",
    columns: [
      { key: "name", label: "NAME" }, { key: "email", label: "EMAIL" }, { key: "role", label: "ROLE" }, { key: "branch", label: "BRANCH" }, { key: "status", label: "STATUS", status: true },
    ],
    map: (r) => ({ id: r.user_id, name: r.full_name, email: r.email, role: label(r.role_name), branch: r.branch_name ?? "—", status: active(r.is_active) }),
  },
};
