import { execFileSync, spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = path.join(projectRoot, ".runtime");
const lockPath = path.join(runtimeDir, "dev-server.json");
const port = Number(process.env.AV_INTERACTIVE_PORT || 3002);
const action = process.argv[2] || "start";

function readLock() {
  try { return JSON.parse(readFileSync(lockPath, "utf8")); } catch { return null; }
}

function alive(pid) {
  if (!Number.isInteger(pid)) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function exactProjectProcess(record) {
  if (!record || record.projectRoot !== projectRoot || record.command !== "vinext dev") return false;
  if (!alive(record.childPid)) return false;
  try {
    const command = execFileSync("ps", ["-p", String(record.childPid), "-o", "command="], { encoding: "utf8" });
    const cwd = execFileSync("lsof", ["-a", "-p", String(record.childPid), "-d", "cwd", "-Fn"], { encoding: "utf8" });
    return command.includes(path.join(projectRoot, "node_modules", ".bin", "vinext")) && cwd.includes(`n${projectRoot}`);
  } catch { return false; }
}

if (action === "status") {
  const record = readLock();
  if (exactProjectProcess(record)) {
    console.log(`av-interactive dev server: running on http://localhost:${record.port} (pid ${record.childPid})`);
    process.exit(0);
  }
  console.log("av-interactive dev server: stopped");
  process.exit(1);
}

if (action === "stop") {
  const record = readLock();
  if (!exactProjectProcess(record)) {
    console.error("Refusing to stop: no verified av-interactive dev process is recorded.");
    process.exit(1);
  }
  process.kill(record.childPid, "SIGTERM");
  if (alive(record.guardPid)) process.kill(record.guardPid, "SIGTERM");
  console.log(`Stopped av-interactive dev server on port ${record.port}.`);
  process.exit(0);
}

if (action !== "start") {
  console.error(`Unknown action: ${action}`);
  process.exit(2);
}

mkdirSync(runtimeDir, { recursive: true });
const existing = readLock();
if (exactProjectProcess(existing)) {
  console.error(`Refusing duplicate start: av-interactive is already running at http://localhost:${existing.port}.`);
  process.exit(1);
}
rmSync(lockPath, { force: true });
let lockFd;
try {
  lockFd = openSync(lockPath, "wx");
} catch {
  console.error("Refusing duplicate start: another process is acquiring the dev-server lock.");
  process.exit(1);
}

const bin = path.join(projectRoot, "node_modules", ".bin", "vinext");
const child = spawn(bin, ["dev", "--port", String(port), "--strictPort"], {
  cwd: projectRoot,
  env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
  stdio: "inherit",
});
writeFileSync(lockFd, JSON.stringify({ guardPid: process.pid, childPid: child.pid, port, projectRoot, command: "vinext dev", startedAt: new Date().toISOString() }, null, 2));
closeSync(lockFd);

let closing = false;
function cleanup(signal) {
  if (closing) return;
  closing = true;
  const record = readLock();
  if (record?.guardPid === process.pid) rmSync(lockPath, { force: true });
  if (signal && alive(child.pid)) child.kill(signal);
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { cleanup(signal); process.exit(0); });
}
child.on("exit", (code, signal) => {
  cleanup();
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
