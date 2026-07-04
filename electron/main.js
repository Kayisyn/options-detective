const { app, BrowserWindow, clipboard, ipcMain, utilityProcess } = require("electron");
const path = require("path");

const BACKEND_PORT = Number(process.env.PORT || 3001);
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
// Set VITE_DEV_SERVER_URL to point the window at the Vite dev server;
// otherwise the built frontend (frontend/dist) is loaded.
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || null;

let backendProc = null;

function startBackend() {
  const backendDir = path.join(__dirname, "..", "backend");
  backendProc = utilityProcess.fork(path.join(backendDir, "server.js"), [], {
    cwd: backendDir,
    env: { ...process.env, PORT: String(BACKEND_PORT) },
    stdio: "pipe",
  });
  backendProc.stdout?.on("data", (d) => console.log("[backend]", String(d).trimEnd()));
  backendProc.stderr?.on("data", (d) => console.error("[backend]", String(d).trimEnd()));
  backendProc.on("exit", (code) => console.log(`[backend] exited (${code})`));
}

async function waitForBackend(timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`${BACKEND_URL}/health`);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function forward(pathname, body, method) {
  const resolvedMethod = method || (body === undefined ? "GET" : "POST");
  const init = {
    method: resolvedMethod,
    ...(body === undefined ? {} : {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  };
  const res = await fetch(`${BACKEND_URL}${pathname}`, init);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload.error || `${pathname} failed (${res.status})`);
  }
  return payload;
}

function registerIpc() {
  ipcMain.handle("api:detect", (_event, body) => forward("/detect", body));
  ipcMain.handle("api:calculate", (_event, body) => forward("/calculate", body));
  ipcMain.handle("api:recommend", (_event, body) => forward("/recommend", body));
  ipcMain.handle("api:data", (_event, { symbol }) => forward(`/data/${encodeURIComponent(symbol)}`));
  ipcMain.handle("api:trades:list", () => forward("/trades"));
  ipcMain.handle("api:trades:save", (_event, body) => forward("/trades", body));
  ipcMain.handle("api:trades:delete", (_event, { id }) => forward(`/trades/${encodeURIComponent(id)}`, undefined, "DELETE"));
  ipcMain.handle("api:export", (_event, { text }) => {
    clipboard.writeText(String(text ?? ""));
    return true;
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: "#020617",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "frontend", "dist", "index.html"));
  }
}

app.whenReady().then(async () => {
  registerIpc();
  startBackend();
  const healthy = await waitForBackend();
  if (!healthy) {
    console.error("[electron] backend did not become healthy within 20s — window will show errors");
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
  backendProc?.kill();
});
