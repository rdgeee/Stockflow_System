import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const here = path.dirname(fileURLToPath(import.meta.url));

// Which port is the Express API on?  API_PORT (set by `npm start` at the project root) wins,
// otherwise PORT from backend/.env, otherwise 5000.
function apiPort() {
  if (process.env.API_PORT) return process.env.API_PORT;
  try {
    const env = fs.readFileSync(path.resolve(here, "../backend/.env"), "utf8");
    const match = env.match(/^\s*PORT\s*=\s*(\d+)/m);
    if (match) return match[1];
  } catch { /* no .env yet */ }
  return "5000";
}

// In dev, requests to /api are forwarded to the Express backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: `http://127.0.0.1:${apiPort()}`, changeOrigin: true },
    },
  },
});
