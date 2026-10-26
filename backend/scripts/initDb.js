// Creates the database (if missing) and applies sql/schema.sql.  Use --drop to start from scratch.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { env } from "../src/config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const drop = process.argv.includes("--drop");
const { database, ...conn } = env.db;

const connection = await mysql.createConnection({ ...conn, multipleStatements: true });
try {
  if (drop) { await connection.query(`DROP DATABASE IF EXISTS \`${database}\``); console.log(`Dropped database ${database}`); }
  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await connection.query(`USE \`${database}\``);
  await connection.query(fs.readFileSync(path.join(__dirname, "../sql/schema.sql"), "utf8"));
  // Databases created before suppliers existed: add the column + link to the existing purchase_orders table.
  const [[{ n }]] = await connection.query(
    "SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema = ? AND table_name = 'purchase_orders' AND column_name = 'supplier_id'", [database]);
  if (!n) {
    await connection.query("ALTER TABLE purchase_orders ADD COLUMN supplier_id INT NULL AFTER branch_id, ADD CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id)");
    console.log("✔ Upgraded purchase_orders with supplier_id.");
  }
  console.log(`✔ Database "${database}" is ready (15 tables).`);
} finally {
  await connection.end();
}
