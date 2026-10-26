export default function StatCard({ label, value, change, icon: Icon, tone = "green" }) {
  return (
    <article className="stat-card">
      <div className={`stat-icon ${tone}`}><Icon size={19} aria-hidden="true" /></div>
      <p className="stat-label">{label}</p>
      <div className="stat-bottom">
        <strong className="stat-value">{value}</strong>
        <span className="stat-change">{change}</span>
      </div>
    </article>
  );
}
