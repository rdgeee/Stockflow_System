const BASE = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "stockflow_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Thin fetch wrapper: adds the JWT, parses JSON, throws ApiError with the server's message. */
export async function api(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Is the backend running on port 5000?");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && getToken()) {
      clearToken();
      window.dispatchEvent(new Event("stockflow:unauthorized"));
    }
    throw new ApiError(response.status, payload.error || `Request failed (${response.status})`);
  }
  return payload;
}

export const login = (email, password) => api("/auth/login", { method: "POST", body: { email, password } });
export const fetchMe = () => api("/auth/me");
