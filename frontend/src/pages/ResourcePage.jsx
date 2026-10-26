import { useMemo, useState } from "react";
import { Download, Plus, Search } from "lucide-react";
import Button from "../components/Button.jsx";
import DataTable from "../components/DataTable.jsx";
import DetailModal from "../components/DetailModal.jsx";
import FormModal from "../components/FormModal.jsx";
import SearchBar from "../components/SearchBar.jsx";
import { useToast } from "../components/Toast.jsx";
import { resources } from "../config/resources.js";
import { allowed, crud, resolve } from "../config/crud.jsx";
import { useFetch } from "../api/useFetch.js";

export default function ResourcePage({ resource, globalQuery = "", user }) {
  const definition = resources[resource];
  const config = crud[resource] ?? {};
  const toast = useToast();
  const separator = definition.endpoint?.includes("?") ? "&" : "?";
  const { data, loading, error, reload } = useFetch(definition.endpoint ? `${definition.endpoint}${separator}limit=500` : null);
  const [localQuery, setLocalQuery] = useState("");
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(null);

  const records = useMemo(() => (data?.data ?? []).map((raw) => ({ raw, view: definition.map(raw) })), [data, definition]);
  const rawById = useMemo(() => new Map(records.map((r) => [r.view.id, r.raw])), [records]);
  const allRows = useMemo(() => records.map((r) => r.view), [records]);

  const localFilter = localQuery.trim().toLowerCase();
  const globalFilter = globalQuery.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!localFilter && !globalFilter) return allRows;
    return allRows.filter((row) => {
      const text = Object.values(row).join(" ").toLowerCase();
      return (!localFilter || text.includes(localFilter)) && (!globalFilter || text.includes(globalFilter));
    });
  }, [allRows, globalFilter, localFilter]);
  const isFiltered = Boolean(localFilter || globalFilter);

  const actions = (config.actions ?? []).filter((a) => allowed(user, a.roles));
  const canCreate = config.create && allowed(user, config.create.roles);

  // ----- opening dialogs / running actions -----
  function openCreate() {
    const c = config.create;
    setModal({
      kind: "form", title: c.title, description: c.description, submitLabel: "Create",
      fields: resolve(c.fields), initial: resolve(c.initial) ?? {},
      onSubmit: async (values) => { await c.submit(values); toast.success(c.success); reload(); setModal(null); },
    });
  }

  async function runAction(action, raw) {
    if (action.detail) {
      return setModal({ kind: "detail", title: resolve(action.detail.title, raw), endpoint: action.detail.endpoint(raw), render: action.detail.render });
    }
    if (action.form) {
      const f = action.form;
      return setModal({
        kind: "form", title: resolve(f.title, raw), description: resolve(f.description, raw), submitLabel: "Save changes",
        fields: resolve(f.fields), initial: resolve(f.initial, raw) ?? {},
        onSubmit: async (values) => { await f.submit(values, raw); toast.success(action.success); reload(); setModal(null); },
      });
    }
    if (action.confirm && !window.confirm(resolve(action.confirm, raw))) return;
    const key = `${action.label}:${JSON.stringify(Object.values(raw).slice(0, 1))}`;
    setBusy(key);
    try {
      await action.run(raw);
      toast.success(action.success);
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  const renderActions = actions.length
    ? (row) => {
        const raw = rawById.get(row.id);
        if (!raw) return null;
        const list = actions.filter((a) => !a.when || a.when(raw, user));
        return (
          <div className="row-actions">
            {list.map((a) => (
              <button key={a.label} type="button" disabled={busy !== null}
                className={`row-btn ${a.tone === "danger" ? "row-btn-danger" : ""}`}
                onClick={() => runAction(a, raw)}>{a.label}</button>
            ))}
          </div>
        );
      }
    : undefined;

  let body;
  if (!definition.endpoint) body = <div className="filtered-empty"><span>{definition.emptyNote}</span></div>;
  else if (loading && !data) body = <div className="filtered-empty"><span>Loading {resource.toLowerCase()}…</span></div>;
  else if (error) body = <div className="filtered-empty form-error" role="alert"><span>{error}</span></div>;
  else if (rows.length === 0 && isFiltered) {
    body = (
      <div className="filtered-empty">
        <Search size={20} aria-hidden="true" />
        <span>No {resource.toLowerCase()} match your search. Try a different search.</span>
      </div>
    );
  } else body = <DataTable columns={definition.columns} rows={rows} renderActions={renderActions} emptyMessage={`No ${resource.toLowerCase()} yet.`} />;

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{definition.eyebrow}</p>
          <h1>{resource}</h1>
          <p className="page-subtitle">{definition.description}</p>
        </div>
        <div className="heading-actions">
          <Button variant="secondary" onClick={() => window.print()}>
            <Download size={16} aria-hidden="true" /> Print list
          </Button>
          {canCreate && <Button onClick={openCreate}><Plus size={16} aria-hidden="true" /> {config.create.label}</Button>}
        </div>
      </div>
      <section className="content-panel">
        <div className="panel-toolbar">
          <div className="panel-title">
            <h2>{resource} records</h2>
            <p>Live data from the StockFlow database.</p>
          </div>
          <div className="table-controls">
            <SearchBar value={localQuery} onChange={setLocalQuery} placeholder={`Search ${resource.toLowerCase()}...`} />
            <span className="record-count">{rows.length} {rows.length === 1 ? "record" : "records"}</span>
          </div>
        </div>
        {body}
      </section>

      {modal?.kind === "form" && (
        <FormModal title={modal.title} description={modal.description} fields={modal.fields} initial={modal.initial}
          submitLabel={modal.submitLabel} onSubmit={modal.onSubmit} onClose={() => setModal(null)} />
      )}
      {modal?.kind === "detail" && (
        <DetailModal title={modal.title} endpoint={modal.endpoint} render={modal.render} onClose={() => setModal(null)} />
      )}
    </>
  );
}
