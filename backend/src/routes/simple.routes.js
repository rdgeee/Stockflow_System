import { crudRouter } from "../utils/crudRouter.js";
import { ROLES } from "../middleware/auth.js";

export const rolesRouter = crudRouter({
  table: "roles", pk: "role_id", fields: ["role_name", "description"], required: ["role_name"],
  search: ["t.role_name", "t.description"], orderBy: "t.role_id ASC",
});

export const branchesRouter = crudRouter({
  table: "branches", pk: "branch_id",
  fields: ["branch_code", "branch_name", "street", "barangay", "city", "postal_code", "contact_number", "is_active"],
  required: ["branch_code", "branch_name"],
  columns: `t.*, CONCAT_WS(', ', t.street, t.barangay, t.city) AS address,
            (SELECT COALESCE(SUM(i.quantity_on_hand),0) FROM inventory i WHERE i.branch_id = t.branch_id) AS total_units`,
  search: ["t.branch_code", "t.branch_name", "t.city", "t.barangay"], filters: ["is_active", "city"],
  orderBy: "t.branch_name ASC", softDelete: "is_active",
});

export const productsRouter = crudRouter({
  table: "products", pk: "product_id",
  fields: ["sku", "product_name", "description", "category", "unit_price", "reorder_threshold", "is_active"],
  required: ["sku", "product_name"],
  columns: `t.*, (SELECT COALESCE(SUM(i.quantity_on_hand),0) FROM inventory i WHERE i.product_id = t.product_id) AS total_stock`,
  search: ["t.sku", "t.product_name", "t.category"], filters: ["category", "is_active"],
  orderBy: "t.product_name ASC", writeRoles: [ROLES.MANAGER, ROLES.COORDINATOR], softDelete: "is_active",
});

export const suppliersRouter = crudRouter({
  table: "suppliers", pk: "supplier_id",
  fields: ["supplier_name", "contact_person", "email", "phone", "address", "is_active"],
  required: ["supplier_name"],
  columns: `t.*, (SELECT COUNT(*) FROM purchase_orders po WHERE po.supplier_id = t.supplier_id) AS order_count`,
  search: ["t.supplier_name", "t.contact_person", "t.email", "t.phone"], filters: ["is_active"],
  orderBy: "t.supplier_name ASC", writeRoles: [ROLES.COORDINATOR], softDelete: "is_active",
});

export const vehiclesRouter = crudRouter({
  table: "vehicles", pk: "vehicle_id",
  fields: ["driver_user_id", "plate_number", "vehicle_type", "capacity", "status"],
  required: ["plate_number"],
  columns: "t.*, CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name",
  joins: "LEFT JOIN users d ON d.user_id = t.driver_user_id",
  search: ["t.plate_number", "t.vehicle_type", "d.first_name", "d.last_name"], filters: ["status"],
  orderBy: "t.plate_number ASC", writeRoles: [ROLES.MANAGER],
});

export const routesRouter = crudRouter({
  table: "routes", pk: "route_id",
  fields: ["origin_branch_id", "destination_branch_id", "route_name", "distance_km", "estimated_duration"],
  required: ["origin_branch_id", "destination_branch_id", "route_name"],
  columns: "t.*, o.branch_name AS origin_name, d.branch_name AS destination_name",
  joins: "JOIN branches o ON o.branch_id = t.origin_branch_id JOIN branches d ON d.branch_id = t.destination_branch_id",
  search: ["t.route_name", "o.branch_name", "d.branch_name"], filters: ["origin_branch_id", "destination_branch_id"],
  orderBy: "t.route_name ASC", writeRoles: [ROLES.MANAGER],
});
