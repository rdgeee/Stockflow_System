import { useCallback, useEffect, useState } from "react";
import DashboardLayout from "./layouts/DashboardLayout.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Inventory from "./pages/Inventory.jsx";
import Products from "./pages/Products.jsx";
import Warehouses from "./pages/Warehouses.jsx";
import Suppliers from "./pages/Suppliers.jsx";
import Procurement from "./pages/Procurement.jsx";
import Orders from "./pages/Orders.jsx";
import Distribution from "./pages/Distribution.jsx";
import Vehicles from "./pages/Vehicles.jsx";
import Drivers from "./pages/Drivers.jsx";
import Reports from "./pages/Reports.jsx";
import Users from "./pages/Users.jsx";
import { clearToken, fetchMe, getToken, setToken } from "./api/client.js";

const pageMap = {
  Dashboard, Inventory, Products, Warehouses, Suppliers, Procurement,
  Orders, Distribution, Vehicles, Drivers, Reports, Users,
};

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(Boolean(getToken()));
  const [activePage, setActivePage] = useState("Dashboard");
  const [globalQuery, setGlobalQuery] = useState("");
  const Page = pageMap[activePage] ?? Dashboard;

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setActivePage("Dashboard");
  }, []);

  // Restore an existing session on page load.
  useEffect(() => {
    if (!getToken()) return;
    fetchMe()
      .then(({ user: me }) => setUser(me))
      .catch(() => clearToken())
      .finally(() => setCheckingSession(false));
  }, []);

  // api/client.js fires this when the server rejects the token (expired / revoked).
  useEffect(() => {
    window.addEventListener("stockflow:unauthorized", logout);
    return () => window.removeEventListener("stockflow:unauthorized", logout);
  }, [logout]);

  if (checkingSession) return <div className="boot-screen">Loading StockFlow…</div>;

  if (!user) {
    return <Login onLogin={({ token, user: me }) => { setToken(token); setUser(me); }} />;
  }

  return (
    <DashboardLayout
      user={user}
      activePage={activePage}
      globalQuery={globalQuery}
      onGlobalQueryChange={setGlobalQuery}
      onNavigate={(page) => { setActivePage(page); setGlobalQuery(""); }}
      onLogout={logout}
    >
      <Page globalQuery={globalQuery} user={user} />
    </DashboardLayout>
  );
}
