#!/usr/bin/env node
// StockFlow one-command launcher.  Usage:  npm start   (or: node run.mjs)
//   --no-open     don't open the browser automatically
//   --setup-only  install + prepare the database, but don't start the servers
//   --reset       wipe the database and re-seed it, then start
// It: installs dependencies, creates backend/.env, checks MySQL (asks for the password if needed),
// creates the tables + demo data, then starts the backend and the frontend together.
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.join(ROOT, "backend");
const FRONTEND = path.join(ROOT, "frontend");
const ENV_FILE = path.join(BACKEND, ".env");
const args = new Set(process.argv.slice(2));
const isWin = process.platform === "win32";
const tty = process.stdin.isTTY && process.stdout.isTTY;

const c = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const ok = (m) => console.log(c(32, "✔ ") + m);
const info = (m) => console.log(c(36, "• ") + m);
const warn = (m) => console.log(c(33, "! ") + m);
const step = (m) => console.log("\n" + c("1;35", `▶ ${m}`));
function fail(msg) {
  console.error("\n" + c(31, "✖ ") + msg + "\n");
  process.exit(1);
}

// ---------- 0. Node version ----------
if (Number(process.versions.node.split(".")[0]) < 18) {
  fail(`Node.js 18 or newer is required (you have ${process.versions.node}). Download it from https://nodejs.org (LTS).`);
}

// ---------- helpers ----------
function run(cmd, cwd, extraEnv = {}) {
  return spawnSync(cmd, { cwd, shell: true, stdio: "inherit", env: { ...process.env, ...extraEnv } }).status === 0;
}

async function ask(question) {
  const rl = (await import("node:readline/promises")).createInterface({ input: process.stdin, output: process.stdout });
  try { return (await rl.question(question)).trim(); } finally { rl.close(); }
}

const parseEnv = (text) =>
  Object.fromEntries(
    text.split(/\r?\n/).map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)).filter(Boolean).map((m) => [m[1], m[2]]),
  );

function setEnvVar(key, value) {
  let text = fs.readFileSync(ENV_FILE, "utf8");
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, "m");
  text = re.test(text) ? text.replace(re, () => `${key}=${value}`) : text.replace(/\s*$/, "\n") + `${key}=${value}\n`;
  fs.writeFileSync(ENV_FILE, text);
}

const readEnv = () => parseEnv(fs.readFileSync(ENV_FILE, "utf8"));

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port); // same as Express: all interfaces
  });
}

async function findFreePort(start) {
  for (let p = start; p < start + 20; p++) if (await isPortFree(p)) return p;
  fail(`No free port found between ${start} and ${start + 19}. Close some programs and try again.`);
}

// ---------- 1. backend/.env ----------
step("Checking configuration");
if (!fs.existsSync(ENV_FILE)) {
  fs.copyFileSync(path.join(BACKEND, ".env.example"), ENV_FILE);
  setEnvVar("JWT_SECRET", crypto.randomBytes(32).toString("hex"));
  ok("Created backend/.env (with a fresh JWT secret)");
} else {
  ok("backend/.env found");
}

// ---------- 2. dependencies ----------
step("Checking dependencies");
const needs = (dir, probe) => !fs.existsSync(path.join(dir, "node_modules", probe, "package.json"));
for (const [name, dir, probes] of [["backend", BACKEND, ["express", "mysql2", "bcryptjs"]], ["frontend", FRONTEND, ["vite", "react", "@vitejs/plugin-react", "lucide-react"]]]) {
  if (probes.some((p) => needs(dir, p))) {
    info(`Installing ${name} packages (first run only, needs internet)…`);
    if (!run("npm install --no-audit --no-fund", dir)) {
      fail(`"npm install" failed in ${name}/. Check your internet connection and that Node/npm are installed, then run "npm start" again.`);
    }
  }
  ok(`${name} packages ready`);
}

// ---------- 3. MySQL ----------
step("Checking MySQL");
const require = createRequire(path.join(BACKEND, "package.json"));
const mysql = require("mysql2/promise");

async function canConnect() {
  const e = readEnv();
  try {
    const conn = await mysql.createConnection({
      host: e.DB_HOST || "localhost", port: Number(e.DB_PORT) || 3306,
      user: e.DB_USER || "root", password: e.DB_PASSWORD || "", connectTimeout: 5000,
    });
    await conn.end();
    return null;
  } catch (err) {
    return err;
  }
}

let attempts = 0;
for (;;) {
  const err = await canConnect();
  if (!err) break;
  const e = readEnv();
  const where = `${e.DB_HOST || "localhost"}:${e.DB_PORT || 3306}`;
  attempts++;

  if (err.code === "ER_ACCESS_DENIED_ERROR") {
    warn(`MySQL rejected the login (user "${e.DB_USER || "root"}").`);
    if (!tty || attempts > 4) {
      fail(`Open backend/.env and set DB_USER and DB_PASSWORD to your MySQL login, then run "npm start" again.`);
    }
    const user = (await ask(`  MySQL username [${e.DB_USER || "root"}]: `)) || e.DB_USER || "root";
    const pass = await ask("  MySQL password (shown as you type; leave empty for none): ");
    setEnvVar("DB_USER", user);
    setEnvVar("DB_PASSWORD", pass);
    info("Saved to backend/.env, trying again…");
    continue;
  }

  if (["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH"].includes(err.code) || /connect/i.test(err.message)) {
    warn(`Can't reach MySQL at ${where}. It is probably not running.`);
    console.log(
      [
        "    Start it, then continue:",
        "      • XAMPP / WAMP / Laragon: click “Start” next to MySQL (or MariaDB)",
        "      • Windows service:        open “Services” and start MySQL80",
        "      • macOS (Homebrew):       brew services start mysql",
        "      • Linux:                  sudo systemctl start mysql   (or mariadb)",
        "      • Docker:                 docker compose up -d   (then use DB_PASSWORD=stockflow in backend/.env)",
      ].join("\n"),
    );
    if (!tty || attempts > 20) fail("MySQL is not reachable. Start it and run \"npm start\" again.");
    await ask("\n  Press Enter once MySQL is running (Ctrl+C to quit)… ");
    continue;
  }

  fail(`Could not connect to MySQL: ${err.message}`);
}
ok("MySQL connection works");

// ---------- 4. database + demo data ----------
step("Preparing the database");
if (args.has("--reset")) {
  info("Resetting the database (all data will be replaced)…");
  if (!run("node scripts/initDb.js --drop", BACKEND) || !run("node scripts/seed.js", BACKEND)) fail("Database reset failed (see above).");
} else {
  if (!run("node scripts/initDb.js", BACKEND)) fail("Creating the database tables failed (see above).");
  if (!run("node scripts/seed.js", BACKEND)) fail("Adding the demo data failed (see above). Try \"npm run reset\" to start from a clean database.");
}

if (args.has("--setup-only")) {
  ok("Setup finished. Start the app any time with: npm start");
  process.exit(0);
}

// ---------- 5. start backend + frontend ----------
step("Starting StockFlow");
const wantedApiPort = Number(readEnv().PORT) || 5000;
const apiPort = await findFreePort(wantedApiPort);
if (apiPort !== wantedApiPort) warn(`Port ${wantedApiPort} is busy (on macOS it is often AirPlay Receiver) — using ${apiPort} for the API instead.`);

const children = [];
let shuttingDown = false;
let appUrl = null;
const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");

function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  try {
    if (isWin) spawnSync(`taskkill /pid ${child.pid} /T /F`, { shell: true, stdio: "ignore" });
    else process.kill(-child.pid, "SIGTERM");
  } catch { /* already gone */ }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  children.forEach(killTree);
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => { console.log("\nStopping StockFlow…"); shutdown(0); });
process.on("SIGTERM", () => shutdown(0));

function openBrowser(url) {
  if (args.has("--no-open")) return;
  try {
    const cmd = isWin ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`;
    spawn(cmd, { shell: true, stdio: "ignore", detached: true }).unref();
  } catch { /* the URL is printed anyway */ }
}

function waitForHealth(port, tries = 60) {
  return new Promise((resolve) => {
    const attempt = (n) => {
      const req = http.get({ host: "127.0.0.1", port, path: "/api/health", timeout: 1500 }, (res) => {
        res.resume();
        res.statusCode === 200 ? resolve(true) : n > 0 ? setTimeout(() => attempt(n - 1), 500) : resolve(false);
      });
      req.on("error", () => (n > 0 ? setTimeout(() => attempt(n - 1), 500) : resolve(false)));
      req.on("timeout", () => req.destroy());
    };
    attempt(tries);
  });
}

function start(label, colour, cwd, env, onLine) {
  const child = spawn("npm run dev", {
    cwd, shell: true, detached: !isWin, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", ...env },
  });
  children.push(child);
  const pipe = (stream) => {
    let buf = "";
    stream.on("data", (d) => {
      buf += d.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const raw of lines) {
        const line = stripAnsi(raw);
        if (!line.trim()) continue;
        console.log(`${c(colour, `[${label}]`)} ${line}`);
        onLine?.(line);
      }
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);
  child.on("exit", (code) => {
    if (shuttingDown) return;
    console.error(`\n${c(31, "✖")} The ${label} stopped unexpectedly (exit code ${code}). Scroll up for the error message.`);
    shutdown(1);
  });
  return child;
}

start("backend ", "34", BACKEND, { PORT: String(apiPort) });
start("frontend", "35", FRONTEND, { API_PORT: String(apiPort) }, (line) => {
  const m = line.match(/Local:\s+(http:\/\/\S+)/);
  if (m && !appUrl) { appUrl = m[1].replace(/\/$/, ""); announce(); }
});

let apiReady = false;
async function announce() {
  if (!apiReady) apiReady = await waitForHealth(apiPort);
  if (!apiReady) return warn(`The API did not answer on port ${apiPort}. Check the [backend] messages above.`);
  console.log(
    "\n" + c("1;32", "══════════════════════════════════════════════════════════") +
    `\n  ${c("1;32", "StockFlow is running")}\n` +
    `\n  Open the app:  ${c("1;36", appUrl)}` +
    `\n  API:           http://localhost:${apiPort}/api/health` +
    "\n\n  Demo logins" +
    "\n    Admin        admin@stockflow.com          Admin@123" +
    "\n    Manager      manager.tag@stockflow.com    Password@123" +
    "\n    Coordinator  coordinator@stockflow.com    Password@123" +
    "\n    Driver       driver1@stockflow.com        Password@123" +
    "\n\n  Press Ctrl+C to stop everything." +
    "\n" + c("1;32", "══════════════════════════════════════════════════════════") + "\n",
  );
  openBrowser(appUrl);
}
