import {
  AlertTriangle, Boxes, PackageCheck, ShoppingCart, Warehouse,
} from "lucide-react";
import Button from "../components/Button.jsx";
import DataTable from "../components/DataTable.jsx";
import StatCard from "../components/StatCard.jsx";
import { useFetch } from "../api/useFetch.js";
import { api } from "../api/client.js";
import { useToast } from "../components/Toast.jsx";
import { allowed, ROLE } from "../config/crud.jsx";

const activityColumns = [
  { key: "id", label: "REFERENCE" },
  { key: "item", label: "ITEM" },
  { key: "warehouse", label: "WAREHOUSE" },
  { key: "quantity", label: "QUANTITY" },
  { key: "status", label: "STATUS", status: true },
];
const tones = ["bar-green", "bar-blue", "bar-amber"];
const fmt = (n) => Number(n ?? 0).toLocaleString("en-US");

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function Dashboard({ globalQuery = "", user }) {
  const { data, loading, error, reload } = useFetch("/dashboard/summary");
  const alerts = useFetch("/low-stock-alerts?status=open&limit=50");
  const toast = useToast();
  const canResolve = allowed(user, [ROLE.MANAGER, ROLE.COORDINATOR]);
  async function resolveAlert(id) {
    try {
      await api(`/low-stock-alerts/${id}/resolve`, { method: "PATCH" });
      toast.success("Alert dismissed");
      alerts.reload();
      reload();
    } catch (err) { toast.error(err.message); }
  }
  const alertRows = (alerts.data?.data ?? []).map((a) => ({
    id: a.alert_id, product: `${a.sku} — ${a.product_name}`, branch: a.branch_name,
    qty: a.quantity_at_trigger, threshold: a.threshold_at_trigger,
    since: new Date(a.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" }),
  }));
  const s = data?.data;
  const query = globalQuery.trim().toLowerCase();
  const activity = (s?.recentActivity ?? []).filter((row) => !query || Object.values(row).some((v) => String(v).toLowerCase().includes(query)));

  // Scale the bars to the busiest day of the week.
  const flow = s?.weeklyFlow ?? [];
  const peak = Math.max(1, ...flow.flatMap((d) => [d.inbound, d.outbound]));
  const axisMax = Math.ceil(peak / 4) * 4 || 4;
  const pct = (v) => `${Math.max((v / axisMax) * 100, v > 0 ? 3 : 0)}%`;

  return (
    <>
      <div className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">LIVE OVERVIEW <span className="live-dot" /></p>
          <h1>{greeting()}, {user?.firstName ?? "there"}</h1>
          <p className="page-subtitle">Here’s your supply chain overview for today.</p>
        </div>
        <Button variant="secondary" onClick={() => window.print()}>
          <PackageCheck size={16} aria-hidden="true" /> Export overview
        </Button>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}
      {loading && <div className="filtered-empty"><span>Loading dashboard…</span></div>}

      {s && (
        <>
          <section className="stats-grid" aria-label="Inventory summary">
            <StatCard label="Total products" value={fmt(s.totalProducts)} change="Active in catalog" icon={Boxes} tone="green" />
            <StatCard label="Active warehouses" value={String(s.activeBranches).padStart(2, "0")} change={`Across ${s.regions} ${s.regions === 1 ? "city" : "cities"}`} icon={Warehouse} tone="blue" />
            <StatCard label="Open orders" value={fmt(s.openOrders)} change={`${s.awaitingDispatch} awaiting dispatch`} icon={ShoppingCart} tone="purple" />
            <StatCard label="Low stock alerts" value={fmt(s.lowStockAlerts)} change={s.lowStockAlerts ? "Requires review" : "All clear"} icon={AlertTriangle} tone="orange" />
          </section>

          <section className="dashboard-grid">
            <article className="content-panel flow-panel">
              <div className="panel-heading">
                <div><h2>Stock movement</h2><p>Inbound and outbound units · this week</p></div>
                <span className="panel-period">Last 7 days</span>
              </div>
              <div className="flow-chart" role="img" aria-label="Weekly inbound and outbound stock movement chart">
                <div className="chart-y-labels">
                  {[1, 0.75, 0.5, 0.25, 0].map((f) => <span key={f}>{fmt(Math.round(axisMax * f))}</span>)}
                </div>
                <div className="chart-body">
                  <div className="chart-grid-lines"><i /><i /><i /><i /><i /></div>
                  <div className="chart-bars">
                    {flow.map((day) => (
                      <div className="chart-day" key={day.date}>
                        <div className="bar-pair">
                          <span className="chart-bar inbound-bar" style={{ height: pct(day.inbound) }} title={`${fmt(day.inbound)} in`} />
                          <span className="chart-bar outbound-bar" style={{ height: pct(day.outbound) }} title={`${fmt(day.outbound)} out`} />
                        </div>
                        <span className="chart-day-label">{day.day}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="chart-legend"><span><i className="legend-inbound" /> Inbound</span><span><i className="legend-outbound" /> Outbound</span></div>
            </article>

            <article className="content-panel stock-panel">
              <div className="panel-heading">
                <div><h2>Stock by category</h2><p>Share of units on hand</p></div>
              </div>
              <div className="category-list">
                {s.categories.map((c, i) => (
                  <div className="category-row" key={c.category}>
                    <div className="category-copy"><strong>{c.category}</strong><span>{fmt(c.skus)} SKUs</span></div>
                    <div className="category-track"><span className={tones[i % tones.length]} style={{ width: `${c.percent}%` }} /></div>
                    <span className="category-percent">{c.percent}%</span>
                  </div>
                ))}
              </div>
              <div className="stock-total"><div><span className="stock-total-icon"><Boxes size={17} /></span><span>Total units in stock</span></div><strong>{fmt(s.totalUnits)}</strong></div>
            </article>
          </section>

          <section className="content-panel activity-panel">
            <div className="panel-heading">
              <div><h2>Recent activity</h2><p>Latest purchase orders and stock transfers</p></div>
              <span className="activity-window"><span /> Live</span>
            </div>
            <DataTable columns={activityColumns} rows={activity} emptyMessage={query ? `No recent activity matches “${globalQuery}”.` : "No activity yet."} />
          </section>

          <section className="content-panel alerts-panel">
            <div className="panel-heading">
              <div><h2>Low-stock alerts</h2><p>Products at or below their reorder level. They clear automatically when stock is replenished.</p></div>
              <span className="activity-window"><AlertTriangle size={14} aria-hidden="true" /> {alertRows.length} open</span>
            </div>
            <DataTable
              columns={[{ key: "product", label: "PRODUCT" }, { key: "branch", label: "BRANCH" }, { key: "qty", label: "ON HAND" }, { key: "threshold", label: "REORDER AT" }, { key: "since", label: "SINCE" }]}
              rows={alertRows}
              emptyMessage="All clear — nothing is below its reorder level."
              renderActions={canResolve && alertRows.length ? (row) => (
                <div className="row-actions"><button type="button" className="row-btn" onClick={() => resolveAlert(row.id)}>Dismiss</button></div>
              ) : undefined}
            />
          </section>
        </>
      )}
    </>
  );
}
