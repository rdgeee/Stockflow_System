import { useState } from "react";
import Navbar from "../components/Navbar.jsx";
import Sidebar from "../components/Sidebar.jsx";

export default function DashboardLayout({
  user,
  activePage,
  globalQuery,
  onGlobalQueryChange,
  onNavigate,
  onLogout,
  children,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  function navigateTo(page) {
    onNavigate(page);
    setIsMenuOpen(false);
  }

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        activePage={activePage}
        onNavigate={navigateTo}
        onLogout={onLogout}
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
      />
      <div className="main-area">
        <Navbar
          user={user}
          activePage={activePage}
          globalQuery={globalQuery}
          onGlobalQueryChange={onGlobalQueryChange}
          onToggleMenu={() => setIsMenuOpen((open) => !open)}
          onBellClick={() => navigateTo("Dashboard")}
        />
        <main className="page-content">{children}</main>
        <footer className="footer">© 2026 StockFlow <span>·</span> Multi-Warehouse Inventory &amp; Distribution</footer>
      </div>
    </div>
  );
}
