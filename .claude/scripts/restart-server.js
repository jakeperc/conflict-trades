#!/usr/bin/env node
/**
 * Stop any Node process serving server.js on PORT (default 8899),
 * then start a new one detached in the background.
 *
 * Output: JSON with action and new PID.
 */
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const PORT = Number(process.env.PORT || 8899);
const ROOT = path.join(__dirname, "..", "..");
const SERVER_PATH = path.join(ROOT, "server.js");
const PID_FILE = path.join(ROOT, "data", ".server.pid");

function pidIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readStoredPid() {
  try {
    const raw = fs.readFileSync(PID_FILE, "utf-8").trim();
    const pid = Number(raw);
    if (Number.isInteger(pid) && pid > 0) return pid;
  } catch {}
  return null;
}

function killOnPort() {
  const killed = [];
  // First try stored PID
  const stored = readStoredPid();
  if (stored && pidIsAlive(stored)) {
    try {
      process.kill(stored);
      killed.push(stored);
    } catch {}
  }

  // Then sweep with netstat
  try {
    const output = execSync(`netstat -ano -p TCP | findstr :${PORT} | findstr LISTENING`, {
      encoding: "utf-8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"]
    });
    const pids = new Set();
    output
      .split(/\r?\n/)
      .map((line) => line.trim().split(/\s+/).pop())
      .filter(Boolean)
      .forEach((pid) => pids.add(Number(pid)));

    for (const pid of pids) {
      if (!Number.isInteger(pid) || pid <= 0) continue;
      if (killed.includes(pid)) continue;
      try {
        execSync(`taskkill /PID ${pid} /F`, { windowsHide: true, stdio: "ignore" });
        killed.push(pid);
      } catch {}
    }
  } catch {
    // No listener found on port — nothing to kill
  }

  return killed;
}

function startServer() {
  const logPath = path.join(ROOT, "data", "server.log");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const out = fs.openSync(logPath, "a");
  const err = fs.openSync(logPath, "a");

  const child = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    detached: true,
    stdio: ["ignore", out, err],
    windowsHide: true
  });
  child.unref();

  fs.mkdirSync(path.dirname(PID_FILE), { recursive: true });
  fs.writeFileSync(PID_FILE, String(child.pid));
  return child.pid;
}

function waitForServer(timeoutMs = 8000) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const tryOnce = () => {
      const req = http.get(
        { hostname: "127.0.0.1", port: PORT, path: "/api/config", timeout: 1000 },
        (res) => {
          res.resume();
          if (res.statusCode === 200) {
            resolve(true);
          } else if (Date.now() < deadline) {
            setTimeout(tryOnce, 250);
          } else {
            resolve(false);
          }
        }
      );
      req.on("error", () => {
        if (Date.now() < deadline) {
          setTimeout(tryOnce, 250);
        } else {
          resolve(false);
        }
      });
      req.on("timeout", () => {
        req.destroy();
      });
    };
    tryOnce();
  });
}

async function main() {
  const killed = killOnPort();
  // brief pause for OS to release the port
  await new Promise((r) => setTimeout(r, 300));
  const pid = startServer();
  const ready = await waitForServer();
  console.log(
    JSON.stringify(
      {
        action: "restart",
        port: PORT,
        killedPids: killed,
        newPid: pid,
        ready,
        url: `http://127.0.0.1:${PORT}`
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exit(1);
});
