-- StockFlow schema (generated from Diagram.pdf). MySQL 8+ / MariaDB 10.5+
-- Create the database first (npm run db:init does this for you), then run this file.

CREATE TABLE IF NOT EXISTS roles (
  role_id      INT AUTO_INCREMENT PRIMARY KEY,
  role_name    VARCHAR(50)  NOT NULL UNIQUE,
  description  VARCHAR(255)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS branches (
  branch_id      INT AUTO_INCREMENT PRIMARY KEY,
  branch_code    VARCHAR(20)  NOT NULL UNIQUE,
  branch_name    VARCHAR(100) NOT NULL,
  street         VARCHAR(150),
  barangay       VARCHAR(100),
  city           VARCHAR(100),
  postal_code    VARCHAR(10),
  contact_number VARCHAR(20),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  user_id       INT AUTO_INCREMENT PRIMARY KEY,
  role_id       INT NOT NULL,
  branch_id     INT NULL,
  first_name    VARCHAR(50) NOT NULL,
  middle_name   VARCHAR(50),
  last_name     VARCHAR(50) NOT NULL,
  email         VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_role   FOREIGN KEY (role_id)   REFERENCES roles(role_id),
  CONSTRAINT fk_users_branch FOREIGN KEY (branch_id) REFERENCES branches(branch_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  product_id        INT AUTO_INCREMENT PRIMARY KEY,
  sku               VARCHAR(50)  NOT NULL UNIQUE,
  product_name      VARCHAR(150) NOT NULL,
  description       VARCHAR(255),
  category          VARCHAR(100),
  unit_price        DECIMAL(10,2) NOT NULL DEFAULT 0,
  reorder_threshold INT NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS inventory (
  inventory_id               INT AUTO_INCREMENT PRIMARY KEY,
  branch_id                  INT NOT NULL,
  product_id                 INT NOT NULL,
  quantity_on_hand           INT NOT NULL DEFAULT 0,
  reorder_threshold_override INT NULL,
  last_updated               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_inventory_branch_product (branch_id, product_id),
  CONSTRAINT chk_inventory_qty CHECK (quantity_on_hand >= 0),
  CONSTRAINT fk_inv_branch  FOREIGN KEY (branch_id)  REFERENCES branches(branch_id),
  CONSTRAINT fk_inv_product FOREIGN KEY (product_id) REFERENCES products(product_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_transfers (
  transfer_id    INT AUTO_INCREMENT PRIMARY KEY,
  from_branch_id INT NOT NULL,
  to_branch_id   INT NOT NULL,
  requested_by   INT NOT NULL,
  approved_by    INT NULL,
  status         VARCHAR(30) NOT NULL DEFAULT 'pending',
  requested_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at    DATETIME NULL,
  completed_at   DATETIME NULL,
  CONSTRAINT chk_transfer_branches CHECK (from_branch_id <> to_branch_id),
  CONSTRAINT fk_st_from   FOREIGN KEY (from_branch_id) REFERENCES branches(branch_id),
  CONSTRAINT fk_st_to     FOREIGN KEY (to_branch_id)   REFERENCES branches(branch_id),
  CONSTRAINT fk_st_req    FOREIGN KEY (requested_by)   REFERENCES users(user_id),
  CONSTRAINT fk_st_appr   FOREIGN KEY (approved_by)    REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  transfer_item_id INT AUTO_INCREMENT PRIMARY KEY,
  transfer_id      INT NOT NULL,
  product_id       INT NOT NULL,
  quantity         INT NOT NULL,
  CONSTRAINT chk_sti_qty CHECK (quantity > 0),
  CONSTRAINT fk_sti_transfer FOREIGN KEY (transfer_id) REFERENCES stock_transfers(transfer_id) ON DELETE CASCADE,
  CONSTRAINT fk_sti_product  FOREIGN KEY (product_id)  REFERENCES products(product_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS suppliers (
  supplier_id    INT AUTO_INCREMENT PRIMARY KEY,
  supplier_name  VARCHAR(150) NOT NULL UNIQUE,
  contact_person VARCHAR(100),
  email          VARCHAR(100),
  phone          VARCHAR(30),
  address        VARCHAR(255),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_orders (
  po_id          INT AUTO_INCREMENT PRIMARY KEY,
  coordinator_id INT NOT NULL,
  branch_id      INT NOT NULL,
  supplier_id    INT NULL,
  status         VARCHAR(30) NOT NULL DEFAULT 'pending',
  order_date     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expected_date  DATETIME NULL,
  CONSTRAINT fk_po_coord  FOREIGN KEY (coordinator_id) REFERENCES users(user_id),
  CONSTRAINT fk_po_branch FOREIGN KEY (branch_id)      REFERENCES branches(branch_id),
  CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id)  REFERENCES suppliers(supplier_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS purchase_order_items (
  po_item_id INT AUTO_INCREMENT PRIMARY KEY,
  po_id      INT NOT NULL,
  product_id INT NOT NULL,
  quantity   INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  CONSTRAINT chk_poi_qty CHECK (quantity > 0),
  CONSTRAINT fk_poi_po      FOREIGN KEY (po_id)      REFERENCES purchase_orders(po_id) ON DELETE CASCADE,
  CONSTRAINT fk_poi_product FOREIGN KEY (product_id) REFERENCES products(product_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS vehicles (
  vehicle_id     INT AUTO_INCREMENT PRIMARY KEY,
  driver_user_id INT NULL,
  plate_number   VARCHAR(20) NOT NULL UNIQUE,
  vehicle_type   VARCHAR(50),
  capacity       DECIMAL(10,2),
  status         VARCHAR(30) NOT NULL DEFAULT 'available',
  CONSTRAINT fk_veh_driver FOREIGN KEY (driver_user_id) REFERENCES users(user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS routes (
  route_id              INT AUTO_INCREMENT PRIMARY KEY,
  origin_branch_id      INT NOT NULL,
  destination_branch_id INT NOT NULL,
  route_name            VARCHAR(100) NOT NULL,
  distance_km           DECIMAL(10,2),
  estimated_duration    INT COMMENT 'minutes',
  CONSTRAINT fk_route_origin FOREIGN KEY (origin_branch_id)      REFERENCES branches(branch_id),
  CONSTRAINT fk_route_dest   FOREIGN KEY (destination_branch_id) REFERENCES branches(branch_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shipments (
  shipment_id           INT AUTO_INCREMENT PRIMARY KEY,
  shipment_number       VARCHAR(50) NOT NULL UNIQUE,
  purchase_order_id     INT NULL,
  transfer_id           INT NULL,
  driver_user_id        INT NULL,
  vehicle_id            INT NULL,
  route_id              INT NULL,
  origin_branch_id      INT NULL,
  destination_branch_id INT NULL,
  status                VARCHAR(30) NOT NULL DEFAULT 'scheduled',
  scheduled_at          DATETIME NULL,
  delivered_at          DATETIME NULL,
  CONSTRAINT fk_ship_po      FOREIGN KEY (purchase_order_id)     REFERENCES purchase_orders(po_id),
  CONSTRAINT fk_ship_tr      FOREIGN KEY (transfer_id)           REFERENCES stock_transfers(transfer_id),
  CONSTRAINT fk_ship_driver  FOREIGN KEY (driver_user_id)        REFERENCES users(user_id),
  CONSTRAINT fk_ship_vehicle FOREIGN KEY (vehicle_id)            REFERENCES vehicles(vehicle_id),
  CONSTRAINT fk_ship_route   FOREIGN KEY (route_id)              REFERENCES routes(route_id),
  CONSTRAINT fk_ship_origin  FOREIGN KEY (origin_branch_id)      REFERENCES branches(branch_id),
  CONSTRAINT fk_ship_dest    FOREIGN KEY (destination_branch_id) REFERENCES branches(branch_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS low_stock_alerts (
  alert_id             INT AUTO_INCREMENT PRIMARY KEY,
  product_id           INT NOT NULL,
  branch_id            INT NOT NULL,
  threshold_at_trigger INT NOT NULL,
  quantity_at_trigger  INT NOT NULL,
  status               VARCHAR(30) NOT NULL DEFAULT 'open',
  created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at          DATETIME NULL,
  CONSTRAINT fk_lsa_product FOREIGN KEY (product_id) REFERENCES products(product_id),
  CONSTRAINT fk_lsa_branch  FOREIGN KEY (branch_id)  REFERENCES branches(branch_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  audit_id   INT AUTO_INCREMENT PRIMARY KEY,
  table_name VARCHAR(100) NOT NULL,
  record_id  INT NULL,
  action     VARCHAR(30) NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  changed_by INT NULL,
  changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_table_record (table_name, record_id),
  INDEX idx_audit_changed_at (changed_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (changed_by) REFERENCES users(user_id)
) ENGINE=InnoDB;
