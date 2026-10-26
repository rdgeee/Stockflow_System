import {
  Boxes,
  CarFront,
  ChartNoAxesCombined,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Package,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
  X,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Inventory", icon: Boxes },
  { label: "Products", icon: Package },
  { label: "Warehouses", icon: Warehouse },
  { label: "Suppliers", icon: Truck },
  { label: "Procurement", icon: ShoppingCart },
  { label: "Orders", icon: ClipboardList },
  { label: "Distribution", icon: MapPinned },
  { label: "Vehicles", icon: CarFront },
  { label: "Drivers", icon: Users },
  { label: "Reports", icon: ChartNoAxesCombined },
  { label: "Users", icon: Users },
];

const initials = (name = "") => name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const roleLabel = (role = "") => role.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export default function Sidebar({ user, activePage, onNavigate, onLogout, isOpen, onClose }) {
  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={onClose}
        />
      )}
      <aside className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">S</div>
          <div className="brand-copy">
            <strong>StockFlow</strong>
            <small>INVENTORY ENGINE</small>
          </div>
          <button className="mobile-close" type="button" onClick={onClose} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <p className="nav-caption">WORKSPACE</p>
        <nav className="side-nav" aria-label="Main navigation">
          {navItems.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              className={`nav-link ${activePage === label ? "active" : ""}`}
              aria-current={activePage === label ? "page" : undefined}
              onClick={() => onNavigate(label)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-mini">
            <div className="avatar">{initials(user?.name)}</div>
            <div><strong>{user?.name}</strong><small>{roleLabel(user?.role)}</small></div>
          </div>
          <button type="button" className="nav-link logout-link" onClick={onLogout}>
            <LogOut size={18} aria-hidden="true" /><span>Log out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
