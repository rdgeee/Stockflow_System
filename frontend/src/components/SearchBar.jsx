import { Search } from "lucide-react";

export default function SearchBar({
  value,
  onChange,
  placeholder = "Search records...",
  className = "",
}) {
  return (
    <label className={`search-field ${className}`.trim()}>
      <Search size={16} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </label>
  );
}
