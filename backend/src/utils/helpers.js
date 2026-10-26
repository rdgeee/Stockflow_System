import { httpError } from "./httpError.js";

export function pick(source = {}, keys = []) {
  const out = {};
  for (const k of keys) if (source[k] !== undefined) out[k] = source[k];
  return out;
}

export function paging(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 100, 1), 500);
  return { page, limit, offset: (page - 1) * limit };
}

export function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === "");
  if (missing.length) throw httpError(400, `Missing required field(s): ${missing.join(", ")}`);
}

export function toPositiveInt(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw httpError(400, `${name} must be a positive whole number`);
  return n;
}

/** Validate [{product_id, quantity}] line items. */
export function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) throw httpError(400, "At least one item is required");
  const seen = new Set();
  return items.map((it, i) => {
    const product_id = toPositiveInt(it.product_id, `items[${i}].product_id`);
    const quantity = toPositiveInt(it.quantity, `items[${i}].quantity`);
    if (seen.has(product_id)) throw httpError(400, `Duplicate product_id ${product_id} in items`);
    seen.add(product_id);
    return { ...it, product_id, quantity };
  });
}
