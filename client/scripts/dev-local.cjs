#!/usr/bin/env node

const http = require("node:http");
const net = require("node:net");
const { spawn } = require("node:child_process");

const host = process.env.YIBIAO_DEV_HOST || "127.0.0.1";
const startPort = Number.parseInt(process.env.YIBIAO_DEV_PORT || "5173", 10);
const maxPort = Number.parseInt(process.env.YIBIAO_DEV_MAX_PORT || String(startPort + 20), 10);

let viteProcess = null;
let electronProcess = null;
let shuttingDown = false;

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

async function findPort() {
  for (let port = startPort; port <= maxPort; port += 1) {
    if (await isPortFree(port)) {
      return port;
    }
  }
  throw new Error(`No free local port found from ${startPort} to ${maxPort}.`);
}

function waitForUrl(url, timeoutMs = 30000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.once("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}.`));
          return;
        }
        setTimeout(check, 500);
      });
      req.setTimeout(1000, () => {
        req.destroy();
      });
    };
    check();
  });
}

function prefixOutput(child, label) {
  child.stdout?.on("data", (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[${label}] ${chunk}`));
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  electronProcess?.kill("SIGTERM");
  viteProcess?.kill("SIGTERM");
  setTimeout(() => process.exit(code), 300);
}

async function main() {
  const port = await findPort();
  const rendererUrl = `http://${host}:${port}`;
  console.log(`Starting Yibiao dev client on ${rendererUrl}`);

  viteProcess = spawn("vite", ["--host", host, "--port", String(port), "--strictPort"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  prefixOutput(viteProcess, "vite");
  viteProcess.once("exit", (code) => {
    if (!shuttingDown && code !== 0) {
      shutdown(code || 1);
    }
  });

  await waitForUrl(rendererUrl);

  electronProcess = spawn("electron", ["."], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ELECTRON_RENDERER_URL: rendererUrl,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  prefixOutput(electronProcess, "electron");
  electronProcess.once("exit", (code) => {
    if (!shuttingDown) {
      shutdown(code || 0);
    }
  });
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));

main().catch((error) => {
  console.error(error);
  shutdown(1);
});
