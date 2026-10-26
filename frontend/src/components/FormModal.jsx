import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Modal from "./Modal.jsx";
import Button from "./Button.jsx";
import { api } from "../api/client.js";

/**
 * Generic form dialog.
 * field: { name, label, type: text|number|email|password|date|datetime-local|textarea|select|items,
 *          required, options:[{value,label}], optionsFrom:{endpoint,value,label,filter}, optional (select: allow blank),
 *          autoSelect, hidden, showIf(values), help, placeholder, min, step, minLength, wide }
 * onSubmit(values) may throw - the message is shown inside the dialog.
 */
export default function FormModal({ title, description, fields, initial = {}, submitLabel = "Save", onSubmit, onClose }) {
  const [values, setValues] = useState(() => {
    const v = {};
    for (const f of fields) {
      const given = initial[f.name];
      v[f.name] = given ?? (f.type === "checkbox" ? false : f.type === "items" ? [{ product_id: "", quantity: "" }] : "");
    }
    return v;
  });
  const [options, setOptions] = useState({});
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Load every field's dropdown data once.
  useEffect(() => {
    let cancelled = false;
    fields.filter((f) => f.optionsFrom).forEach(async (f) => {
      const { endpoint, value, label, filter } = f.optionsFrom;
      try {
        const res = await api(endpoint);
        let rows = res.data ?? [];
        if (filter) rows = rows.filter(filter);
        const opts = rows.map((r) => ({ value: String(r[value]), label: typeof label === "function" ? label(r) : r[label] }));
        if (cancelled) return;
        setOptions((o) => ({ ...o, [f.name]: opts }));
        if (f.autoSelect && opts.length) setValues((v) => (v[f.name] ? v : { ...v, [f.name]: opts[0].value }));
      } catch (err) {
        if (!cancelled) setLoadError(`Could not load the list for “${f.label}”: ${err.message}`);
      }
    });
    return () => { cancelled = true; };
  }, [fields]);

  const set = (name, value) => setValues((v) => ({ ...v, [name]: value }));
  const visible = useMemo(() => fields.filter((f) => !f.hidden && (f.showIf ? f.showIf(values) : true)), [fields, values]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    for (const f of visible) {
      if (f.type !== "items") continue;
      const rows = values[f.name].filter((r) => r.product_id || r.quantity);
      if (!rows.length) return setError("Add at least one item.");
      if (rows.some((r) => !r.product_id || !(Number(r.quantity) > 0) || !Number.isInteger(Number(r.quantity)))) {
        return setError("Every item needs a product and a whole-number quantity above 0.");
      }
      const ids = rows.map((r) => r.product_id);
      if (new Set(ids).size !== ids.length) return setError("The same product is listed twice. Combine them into one line.");
    }
    setSaving(true);
    try {
      const cleaned = { ...values };
      for (const f of fields) if (f.type === "items") cleaned[f.name] = values[f.name].filter((r) => r.product_id || r.quantity);
      await onSubmit(cleaned);
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setSaving(false);
    }
  }

  function renderInput(f) {
    const common = { id: `f-${f.name}`, name: f.name, required: f.required, placeholder: f.placeholder };
    if (f.type === "textarea") {
      return <textarea {...common} rows={3} value={values[f.name]} onChange={(e) => set(f.name, e.target.value)} />;
    }
    if (f.type === "select") {
      const list = f.options ?? options[f.name] ?? [];
      return (
        <select {...common} value={values[f.name]} onChange={(e) => set(f.name, e.target.value)}>
          {f.optional ? <option value="">— None —</option> : <option value="" disabled>{f.optionsFrom && !options[f.name] ? "Loading…" : "Select…"}</option>}
          {list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    if (f.type === "items") {
      const list = options[f.name] ?? [];
      const rows = values[f.name];
      const update = (i, patch) => set(f.name, rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
      return (
        <div className="items-editor">
          {rows.map((row, i) => (
            <div className="items-row" key={i}>
              <select aria-label="Product" value={row.product_id} onChange={(e) => update(i, { product_id: e.target.value })}>
                <option value="" disabled>{options[f.name] ? "Select product…" : "Loading…"}</option>
                {list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input aria-label="Quantity" type="number" min="1" step="1" placeholder="Qty" value={row.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
              <button type="button" className="icon-button" aria-label="Remove item" disabled={rows.length === 1} onClick={() => set(f.name, rows.filter((_, idx) => idx !== i))}><Trash2 size={16} /></button>
            </div>
          ))}
          <Button variant="secondary" className="button-sm" onClick={() => set(f.name, [...rows, { product_id: "", quantity: "" }])}><Plus size={14} /> Add item</Button>
        </div>
      );
    }
    if (f.type === "checkbox") {
      return <input {...common} type="checkbox" checked={Boolean(values[f.name])} onChange={(e) => set(f.name, e.target.checked)} />;
    }
    return (
      <input {...common} type={f.type || "text"} min={f.min} step={f.step} minLength={f.minLength}
        autoComplete={f.type === "password" ? "new-password" : "off"}
        value={values[f.name]} onChange={(e) => set(f.name, e.target.value)} />
    );
  }

  return (
    <Modal title={title} description={description} onClose={onClose} wide={fields.some((f) => f.type === "items")}>
      <form className="form-grid" onSubmit={handleSubmit}>
        {visible.map((f) => {
          const Wrapper = f.type === "items" ? "div" : "label";
          return (
            <Wrapper key={f.name} className={`field ${f.wide || f.type === "items" || f.type === "textarea" ? "field-wide" : ""}`}>
              <span className="field-label">{f.label}{f.required && <b aria-hidden="true"> *</b>}</span>
              {renderInput(f)}
              {f.help && <small>{f.help}</small>}
            </Wrapper>
          );
        })}
        {loadError && <div className="form-error field-wide" role="alert">{loadError}</div>}
        {error && <div className="form-error field-wide" role="alert">{error}</div>}
        <div className="modal-actions field-wide">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}
