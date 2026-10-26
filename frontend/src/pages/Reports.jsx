import { ArrowDownToLine, BarChart3, Boxes, Truck, Warehouse } from "lucide-react";
import Button from "../components/Button.jsx";
import { useFetch } from "../api/useFetch.js";

const month = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

export default function Reports() {
  const { data, loading, error } = useFetch("/dashboard/reports");
  const r = data?.data;

  const cards = r && [
    { title: "Inventory health", description: "Stock quantities, low-stock items, and warehouse balances.", icon: Boxes, value: `${r.inventoryHealth.lowItems} items`, note: "at or below reorder point", tone: "green" },
    { title: "Order performance", description: "Purchase orders and transfers fulfilled versus raised this month.", icon: BarChart3, value: r.orderPerformance.fulfilledPercent === null ? "—" : `${r.orderPerformance.fulfilledPercent}%`, note: `fulfilled this month (${r.orderPerformance.total} orders)`, tone: "blue" },
    { title: "Warehouse stock", description: "Units held across all active branches.", icon: Warehouse, value: `${r.branchStock.totalUnits.toLocaleString()} units`, note: `≈ ${r.branchStock.avgPerBranch.toLocaleString()} per branch · ${r.branchStock.branches} branches`, tone: "purple" },
    { title: "Distribution summary", description: "Delivery volume and shipment activity across the fleet.", icon: Truck, value: `${r.distribution.deliveredThisWeek} ${r.distribution.deliveredThisWeek === 1 ? "trip" : "trips"}`, note: "delivered in the last 7 days", tone: "amber" },
  ];

  return (
    <>
      <div className="page-heading">
        <div><p className="eyebrow">ANALYTICS</p><h1>Reports</h1><p className="page-subtitle">A quick look at inventory and distribution performance.</p></div>
        <Button variant="secondary" onClick={() => window.print()}><ArrowDownToLine size={16} aria-hidden="true" /> Print report</Button>
      </div>
      {error && <div className="form-error" role="alert">{error}</div>}
      {loading && <div className="filtered-empty"><span>Loading reports…</span></div>}
      {cards && (
        <section className="report-grid">
          {cards.map(({ title, description, icon: Icon, value, note, tone }) => (
            <article className="report-card" key={title}>
              <div className={`report-icon ${tone}`}><Icon size={19} aria-hidden="true" /></div>
              <h2>{title}</h2>
              <p>{description}</p>
              <div className="report-metric"><strong>{value}</strong><span>{note}</span></div>
              <div className="report-footnote">Live report · {month}</div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
