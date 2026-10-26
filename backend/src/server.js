import app from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./config/db.js";

async function start() {
  try {
    await pool.query("SELECT 1");
    console.log(`✔ Connected to MySQL database "${env.db.database}" on ${env.db.host}:${env.db.port}`);
  } catch (err) {
    console.error("✖ Could not connect to MySQL:", err.message);
    console.error("  Check DB_* values in backend/.env and run `npm run db:init` then `npm run db:seed`.");
    process.exit(1);
  }
  app.listen(env.port, () => console.log(`✔ StockFlow API listening on http://localhost:${env.port}/api`));
}
start();
