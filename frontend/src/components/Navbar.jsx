import { Bell, Menu } from "lucide-react";
import SearchBar from "./SearchBar.jsx";

const initials = (name = "") => name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const roleLabel = (role = "") => role.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export default function Navbar({
  user,
  activePage,
  globalQuery,
  onGlobalQueryChange,
  onToggleMenu,
  onBellClick,
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="menu-toggle" type="button" onClick={onToggleMenu} aria-label="Open navigation">
          <Menu size={21} />
        </button>
        <div className="breadcrumb">
          <span>Workspace</span><b aria-hidden="true">/</b><strong>{activePage}</strong>
        </div>
      </div>
      <div className="topbar-actions">
        <SearchBar
          className="global-search"
          value={globalQuery}
          onChange={onGlobalQueryChange}
          placeholder="Search this page..."
        />
        <button className="icon-button" type="button" aria-label="Low-stock alerts" title="Low-stock alerts" onClick={onBellClick}>
          <Bell size={19} aria-hidden="true" /><i />
        </button>
        <div className="topbar-profile">
          <div className="avatar">{initials(user?.name)}</div>
          <span><strong>{user?.name}</strong><small>{roleLabel(user?.role)}</small></span>
        </div>
      </div>
    </header>
  );
}
