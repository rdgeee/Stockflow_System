# StockFlow – Multi-Warehouse Inventory & Distribution

React (Vite) frontend + Node/Express + MySQL backend, built from `Diagram.pdf` plus a `suppliers` table (15 tables).

```
stockflow/
├── backend/    Express API, MySQL schema, seed data
└── frontend/   Your IM SYSTEM React app, now wired to the API
```

## Run it in VS Code (one command)

You need **Node 18+** and a running **MySQL 8 / MariaDB 10.5+** (XAMPP, MySQL Installer, Homebrew, or `docker compose up -d` using the included `docker-compose.yml`).

1. VS Code → **File → Open Folder…** → choose the `stockflow` folder.
2. Open the terminal (**Terminal → New Terminal**) and run:
   ```bash
   npm start
   ```
   (or press **Ctrl+Shift+B** / ⌘⇧B and pick *StockFlow: start everything*)

`npm start` does everything for you: installs the backend and frontend packages (first run only), creates `backend/.env`, checks MySQL (it asks for your MySQL password if the default one is rejected), creates the database and tables, adds demo data, starts the API and the UI together, and opens the browser at http://localhost:5173.

Stop everything with **Ctrl+C**. Wipe and re-seed the database with `npm run reset`.

<details><summary>Manual way (two terminals) - only if you prefer</summary>

```bash
cd backend && cp .env.example .env   # set DB_PASSWORD
npm install && npm run db:init && npm run db:seed && npm run dev

cd frontend && npm install && npm run dev
```
</details>

### Demo logins (from the seed)
| Role | Email | Password |
|---|---|---|
| Admin | admin@stockflow.com | Admin@123 |
| Branch manager | manager.tag@stockflow.com | Password@123 |
| Procurement coordinator | coordinator@stockflow.com | Password@123 |
| Driver | driver1@stockflow.com | Password@123 |

`npm run db:reset` (backend) wipes and re-seeds. **Change these passwords and `JWT_SECRET` before deploying.**

## What you can do in the UI
Buttons only appear if your role is allowed to use them (the server enforces the same rules).

| Page | Actions | Who |
|---|---|---|
| Dashboard | Dismiss low-stock alerts | Admin, manager, coordinator |
| Inventory | Add stock record · Adjust (add/remove) · Set reorder level | Admin, manager |
| Products | Add · Edit · Deactivate/Reactivate | Admin, manager, coordinator |
| Warehouses | Add · Edit · Deactivate/Reactivate | Admin |
| Suppliers | Add · Edit · Deactivate/Reactivate | Coordinator · Admin |
| Procurement | New purchase order (optionally pick a supplier) · View · Mark ordered · Receive goods · Cancel | Coordinator (receive: also manager) · Admin |
| Orders (transfers) | New transfer · View · Approve / Reject · Complete · Cancel | Manager (own branch) / coordinator · Admin |
| Distribution | New shipment · Start trip · Mark delivered · Edit · Cancel | Manager, coordinator, driver (own shipments) · Admin |
| Vehicles | Add · Edit · Delete | Admin, manager |
| Drivers / Users | Add · Edit · Deactivate/Reactivate | Admin |

Typical flow: Coordinator creates a PO → *Mark ordered* → manager creates a **shipment** for it → driver *Start trip* → *Mark delivered* adds the stock. For transfers: request → source-branch manager *Approve* → shipment → delivered moves the stock.

## How the diagram maps to the API
All routes are under `/api` and need `Authorization: Bearer <token>` except `/auth/login`.

| Table(s) | Endpoints | Frontend page |
|---|---|---|
| users, roles | `/auth/login`, `/auth/me`, `/users`, `/roles` | Login, Users, Drivers |
| branches | `/branches` | Warehouses |
| products | `/products` | Products |
| inventory | `/inventory`, `POST /inventory/adjust` | Inventory |
| stock_transfers + items | `/transfers`, `/:id/approve · reject · cancel · complete` | Orders |
| purchase_orders + items | `/purchase-orders`, `PATCH /:id/status`, `POST /:id/receive` | Procurement |
| vehicles, routes | `/vehicles`, `/routes` | Vehicles |
| shipments | `/shipments`, `PATCH /:id/status` | Distribution |
| low_stock_alerts | `/low-stock-alerts`, `PATCH /:id/resolve` | Dashboard / Reports |
| audit_logs | `/audit-logs` (admin only) | – |
| (aggregates) | `/dashboard/summary`, `/dashboard/reports` | Dashboard, Reports |

## Business rules built in
- **Stock only changes through one service** (`changeStock`) inside a DB transaction: it can never go negative, writes an audit-log entry, and opens/resolves **low-stock alerts** automatically (threshold = per-branch override, else product default).
- **Transfers:** `pending → approved → in_transit → completed` (or `rejected` / `cancelled`). A branch manager can only approve transfers leaving *their* branch. Completing moves stock source → destination atomically.
- **Purchase orders:** `pending → ordered → received` (or `cancelled`). Receiving adds stock to the PO's branch.
- **Shipments:** link to exactly one PO or transfer. Marking one `delivered` completes the transfer / receives the PO. Drivers only see and update their own shipments.
- Passwords are bcrypt-hashed; login is rate-limited; every write is audited.

## Notes
- The original diagram had no suppliers table, so one was added (`suppliers`, plus an optional `supplier_id` on `purchase_orders`). Existing databases are upgraded automatically the next time you run `npm start`.
- Your zip didn't include `data/demoData.js`, so the pages that imported it now read from the API instead.
- Roles are matched by name: `admin`, `branch_manager`, `procurement_coordinator`, `driver`.
