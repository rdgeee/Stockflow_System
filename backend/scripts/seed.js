// Inserts demo data. Safe to re-run: it does nothing if roles already exist.
import bcrypt from "bcryptjs";
import { pool, withTransaction } from "../src/config/db.js";
import { changeStock } from "../src/services/inventoryService.js";
import { receivePurchaseOrder } from "../src/services/purchaseOrderService.js";

// Demo suppliers; also back-fills databases that were seeded before suppliers existed.
async function seedSuppliers() {
  const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM suppliers");
  if (n === 0) {
    await pool.query("INSERT INTO suppliers (supplier_name, contact_person, email, phone, address) VALUES ?", [[
      ["Visayas Packaging Corp.", "Rosa Villanueva", "sales@visayaspack.example", "(032) 345-1100", "Mandaue City, Cebu"],
      ["Bohol Office Depot", "Ramon Aquino", "orders@boholoffice.example", "(038) 411-2200", "CPG Avenue, Tagbilaran City"],
      ["Cebu Industrial Supply", "Liza Fernandez", "hello@cebuindustrial.example", "(032) 255-3300", "Mabolo, Cebu City"],
    ]]);
    console.log("✔ Added demo suppliers.");
  }
  const [sup] = await pool.query("SELECT supplier_id FROM suppliers ORDER BY supplier_id");
  const [pos] = await pool.query("SELECT po_id FROM purchase_orders WHERE supplier_id IS NULL ORDER BY po_id");
  for (const [i, po] of pos.entries()) await pool.query("UPDATE purchase_orders SET supplier_id = ? WHERE po_id = ?", [sup[i % sup.length].supplier_id, po.po_id]);
}

const [{ n }] = (await pool.query("SELECT COUNT(*) AS n FROM roles"))[0];
if (n > 0) { await seedSuppliers(); console.log("Database already seeded - skipping. (Use `npm run db:reset` to start over.)"); await pool.end(); process.exit(0); }

const hash = await bcrypt.hash("Password@123", 10);
const adminHash = await bcrypt.hash("Admin@123", 10);

await withTransaction(async (c) => {
  await c.query("INSERT INTO roles (role_name, description) VALUES ?", [[
    ["admin", "Full system access"],
    ["branch_manager", "Manages a branch: inventory, transfer approvals, vehicles, routes"],
    ["procurement_coordinator", "Creates and tracks purchase orders and shipments"],
    ["driver", "Delivers shipments"],
  ]]);
  const role = Object.fromEntries((await c.query("SELECT role_id, role_name FROM roles"))[0].map((r) => [r.role_name, r.role_id]));

  await c.query("INSERT INTO branches (branch_code, branch_name, street, barangay, city, postal_code, contact_number) VALUES ?", [[
    ["TAG-01", "Tagbilaran Main Warehouse", "CPG North Avenue", "Cogon", "Tagbilaran City", "6300", "(038) 411-0001"],
    ["CEB-01", "Cebu Distribution Hub", "M.C. Briones St.", "Mabolo", "Cebu City", "6000", "(032) 255-0002"],
    ["DGT-01", "Dumaguete Depot", "Real St.", "Daro", "Dumaguete City", "6200", "(035) 225-0003"],
    ["TUB-01", "Tubigon Satellite Store", "Poblacion Road", "Poblacion", "Tubigon", "6329", "(038) 508-0004"],
  ]]);
  const branch = Object.fromEntries((await c.query("SELECT branch_id, branch_code FROM branches"))[0].map((b) => [b.branch_code, b.branch_id]));

  await c.query("INSERT INTO users (role_id, branch_id, first_name, middle_name, last_name, email, password_hash) VALUES ?", [[
    [role.admin, null, "Jordan", null, "Lee", "admin@stockflow.com", adminHash],
    [role.branch_manager, branch["TAG-01"], "Maria", "Santos", "Reyes", "manager.tag@stockflow.com", hash],
    [role.branch_manager, branch["CEB-01"], "Carlo", null, "Dela Cruz", "manager.ceb@stockflow.com", hash],
    [role.procurement_coordinator, branch["TAG-01"], "Anna", "Lopez", "Garcia", "coordinator@stockflow.com", hash],
    [role.driver, branch["TAG-01"], "Pedro", null, "Ramos", "driver1@stockflow.com", hash],
    [role.driver, branch["CEB-01"], "Luis", null, "Torres", "driver2@stockflow.com", hash],
  ]]);
  const user = Object.fromEntries((await c.query("SELECT user_id, email FROM users"))[0].map((u) => [u.email, u.user_id]));

  await c.query("INSERT INTO products (sku, product_name, description, category, unit_price, reorder_threshold) VALUES ?", [[
    ["PKG-BOX-S", "Corrugated Box (Small)", "30x20x20 cm shipping carton", "Packaging", 18.5, 200],
    ["PKG-BOX-L", "Corrugated Box (Large)", "60x40x40 cm shipping carton", "Packaging", 42, 150],
    ["PKG-TAPE", "Packing Tape 48mm", "Clear tape, 100m roll", "Packaging", 35, 120],
    ["PKG-BWRAP", "Bubble Wrap Roll", "1m x 50m roll", "Packaging", 650, 20],
    ["OFC-A4", "A4 Bond Paper (Ream)", "70gsm, 500 sheets", "Office supplies", 245, 80],
    ["OFC-PEN", "Ballpoint Pen (Box of 50)", "Blue ink", "Office supplies", 310, 30],
    ["OFC-FLD", "Manila Folder (Pack of 100)", "Legal size", "Office supplies", 380, 25],
    ["EQP-SCAN", "Handheld Barcode Scanner", "USB wired scanner", "Equipment", 3200, 5],
    ["EQP-TRUCK", "Hand Pallet Truck", "2.5 ton capacity", "Equipment", 12500, 3],
    ["EQP-LBL", "Thermal Label Printer", "4-inch desktop printer", "Equipment", 8900, 4],
  ]]);

  await c.query("INSERT INTO vehicles (driver_user_id, plate_number, vehicle_type, capacity, status) VALUES ?", [[
    [user["driver1@stockflow.com"], "NAB 1234", "Closed Van", 1500, "available"],
    [user["driver2@stockflow.com"], "GCD 5678", "Elf Truck", 3000, "available"],
    [null, "ABC 9012", "Motorcycle Courier", 40, "maintenance"],
  ]]);

  await c.query("INSERT INTO routes (origin_branch_id, destination_branch_id, route_name, distance_km, estimated_duration) VALUES ?", [[
    [branch["TAG-01"], branch["CEB-01"], "Tagbilaran → Cebu (RoRo/ferry)", 72, 120],
    [branch["TAG-01"], branch["TUB-01"], "Tagbilaran → Tubigon (road)", 45, 70],
    [branch["CEB-01"], branch["DGT-01"], "Cebu → Dumaguete (south road + ferry)", 135, 240],
  ]]);

  // Stock goes through the service so low-stock alerts and the audit trail are created like in real use.
  const prod = Object.fromEntries((await c.query("SELECT product_id, sku FROM products"))[0].map((p) => [p.sku, p.product_id]));
  const stock = {
    "TAG-01": { "PKG-BOX-S": 900, "PKG-BOX-L": 400, "PKG-TAPE": 90, "PKG-BWRAP": 60, "OFC-A4": 300, "OFC-PEN": 55, "OFC-FLD": 12, "EQP-SCAN": 14, "EQP-TRUCK": 6, "EQP-LBL": 9 },
    "CEB-01": { "PKG-BOX-S": 650, "PKG-BOX-L": 180, "PKG-TAPE": 300, "PKG-BWRAP": 15, "OFC-A4": 150, "OFC-PEN": 80, "EQP-SCAN": 7, "EQP-LBL": 2 },
    "DGT-01": { "PKG-BOX-S": 120, "PKG-TAPE": 150, "OFC-A4": 60, "OFC-FLD": 40, "EQP-TRUCK": 2 },
    "TUB-01": { "PKG-BOX-S": 250, "OFC-A4": 90, "OFC-PEN": 20 },
  };
  for (const [code, items] of Object.entries(stock)) {
    for (const [sku, qty] of Object.entries(items)) {
      await changeStock(c, { branchId: branch[code], productId: prod[sku], delta: qty, userId: user["admin@stockflow.com"], reason: "Opening balance" });
    }
  }

  // One received PO, one open PO, one pending + one approved transfer
  const po = async (status, branchCode, lines) => {
    const [r] = await c.query("INSERT INTO purchase_orders (coordinator_id, branch_id, status, expected_date) VALUES (?,?,?, DATE_ADD(NOW(), INTERVAL 5 DAY))", [user["coordinator@stockflow.com"], branch[branchCode], status === "received" ? "ordered" : status]);
    for (const [sku, qty] of lines) await c.query("INSERT INTO purchase_order_items (po_id, product_id, quantity, unit_price) SELECT ?, product_id, ?, unit_price FROM products WHERE sku = ?", [r.insertId, qty, sku]);
    if (status === "received") await receivePurchaseOrder(c, r.insertId, user["coordinator@stockflow.com"]);
    return r.insertId;
  };
  await po("received", "TAG-01", [["PKG-TAPE", 200], ["OFC-FLD", 60]]);
  await po("ordered", "CEB-01", [["PKG-BWRAP", 40], ["EQP-LBL", 6]]);
  await po("pending", "DGT-01", [["PKG-BOX-S", 300]]);

  const tr = async (from, to, status, lines) => {
    const [r] = await c.query("INSERT INTO stock_transfers (from_branch_id, to_branch_id, requested_by, approved_by, status, approved_at) VALUES (?,?,?,?,?,?)",
      [branch[from], branch[to], user["manager.ceb@stockflow.com"], status === "pending" ? null : user["manager.tag@stockflow.com"], status, status === "pending" ? null : new Date()]);
    for (const [sku, qty] of lines) await c.query("INSERT INTO stock_transfer_items (transfer_id, product_id, quantity) VALUES (?,?,?)", [r.insertId, prod[sku], qty]);
  };
  await tr("TAG-01", "TUB-01", "pending", [["OFC-PEN", 15]]);
  await tr("TAG-01", "CEB-01", "approved", [["PKG-BOX-L", 100], ["OFC-A4", 50]]);

  // Spread the opening-balance audit entries over the last week so the dashboard chart has some shape.
  await c.query("UPDATE audit_logs SET changed_at = DATE_SUB(NOW(), INTERVAL FLOOR(RAND() * 7) DAY) WHERE table_name = 'inventory' AND action IN ('STOCK_IN','STOCK_OUT')");
});

await seedSuppliers();
console.log("✔ Seed complete.\n");
console.log("  Admin        admin@stockflow.com          / Admin@123");
console.log("  Manager      manager.tag@stockflow.com    / Password@123");
console.log("  Coordinator  coordinator@stockflow.com    / Password@123");
console.log("  Driver       driver1@stockflow.com        / Password@123");
await pool.end();
