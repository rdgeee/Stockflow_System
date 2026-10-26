import { HttpError } from "../utils/httpError.js";

export function notFound(req, _res, next) {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err, _req, res, _next) {
  let status = err.status || 500;
  let message = err.message || "Internal server error";

  switch (err.code) {
    case "ER_DUP_ENTRY": status = 409; message = "A record with the same unique value already exists"; break;
    case "ER_ROW_IS_REFERENCED_2": status = 409; message = "This record is in use by other records and cannot be removed"; break;
    case "ER_NO_REFERENCED_ROW_2": status = 400; message = "A referenced record (branch, product, user, ...) does not exist"; break;
    case "ER_CHECK_CONSTRAINT_VIOLATED": status = 400; message = "A value violates a database rule (e.g. negative quantity)"; break;
    case "ER_BAD_NULL_ERROR": status = 400; message = "A required field is missing"; break;
    case "ER_BAD_FIELD_ERROR": status = 400; message = "Unknown field supplied"; break;
    default:
  }
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 && process.env.NODE_ENV === "production" ? "Internal server error" : message,
    details: err.details,
  });
}
