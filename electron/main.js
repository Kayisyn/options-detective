const { app, BrowserWindow, clipboard, ipcMain, shell, utilityProcess } = require("electron");
const path = require("path");

const BACKEND_PORT = Number(process.env.PORT || 3001);
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
// Set VITE_DEV_SERVER_URL to point the window at the Vite dev server;
// otherwise the built frontend (frontend/dist) is loaded.
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || null;

let backendProc = null;

function startBackend() {
  // Packaged: everything lives under resources/ and the math engine is the
  // PyInstaller binary — end users need no Python. Dev: repo paths + venv.
  const backendDir = app.isPackaged
    ? path.join(process.resourcesPath, "backend")
    : path.join(__dirname, "..", "backend");
  const env = { ...process.env, PORT: String(BACKEND_PORT) };
  if (app.isPackaged) {
    env.OD_MATH_BIN = path.join(process.resourcesPath, "od-math", "od-math.exe");
    env.OD_DATA_DIR = app.getPath("userData"); // trade journal location
  }
  backendProc = utilityProcess.fork(path.join(backendDir, "server.js"), [], {
    cwd: backendDir,
    env,
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
  ipcMain.handle("api:market:fx", (_event, refresh) => forward(`/market/fx${refresh ? "?refresh=1" : ""}`));
  ipcMain.handle("api:auth:state", () => forward("/auth/state"));
  ipcMain.handle("api:auth:register", (_event, body) => forward("/auth/register", body));
  ipcMain.handle("api:auth:login", (_event, body) => forward("/auth/login", body));
  ipcMain.handle("api:auth:logout", () => forward("/auth/logout", {}));
  ipcMain.handle("api:detect", (_event, body) => forward("/detect", body));
  ipcMain.handle("api:calculate", (_event, body) => forward("/calculate", body));
  ipcMain.handle("api:recommend", (_event, body) => forward("/recommend", body));
  ipcMain.handle("api:data", (_event, { symbol }) => forward(`/data/${encodeURIComponent(symbol)}`));
  ipcMain.handle("api:trades:list", () => forward("/journal"));
  ipcMain.handle("api:trades:save", (_event, body) => forward("/journal", body));
  ipcMain.handle("api:trades:patch", (_event, { id, payload }) => forward(`/journal/${encodeURIComponent(id)}`, payload, "PATCH"));
  ipcMain.handle("api:trades:close", (_event, { id, payload }) => forward(`/journal/${encodeURIComponent(id)}/close`, payload));
  ipcMain.handle("api:trades:delete", (_event, { id }) => forward(`/journal/${encodeURIComponent(id)}`, undefined, "DELETE"));
  ipcMain.handle("api:trades:marks", () => forward("/journal/marks", {}));
  ipcMain.handle("api:journal:trash:list", () => forward("/journal/trash"));
  ipcMain.handle("api:journal:trash", (_event, id) => forward(`/journal/${encodeURIComponent(id)}/trash`, {}));
  ipcMain.handle("api:journal:restore", (_event, id) => forward(`/journal/${encodeURIComponent(id)}/restore`, {}));
  ipcMain.handle("api:journal:trash-all", () => forward("/journal/trash-all", {}));
  ipcMain.handle("api:journal:restore-all", () => forward("/journal/restore-all", {}));
  ipcMain.handle("api:journal:purge-trash", () => forward("/journal/purge-trash", {}));
  ipcMain.handle("api:paper:get", () => forward("/paper"));
  ipcMain.handle("api:paper:budget", (_event, body) => forward("/paper/budget", body));
  ipcMain.handle("api:paper:open", (_event, body) => forward("/paper/trades", body));
  ipcMain.handle("api:paper:close", (_event, { id, payload }) => forward(`/paper/trades/${encodeURIComponent(id)}/close`, payload));
  ipcMain.handle("api:paper:process", () => forward("/paper/process", {}));
  ipcMain.handle("api:paper:curve", (_event, { days }) => forward(`/paper/equity-curve?days=${Number(days) || 30}`));
  ipcMain.handle("api:paper:reset", (_event, body) => forward("/paper/reset", body));
  ipcMain.handle("api:paper:settings", (_event, body) => forward("/paper/settings", body, "PUT"));
  ipcMain.handle("api:paper:sell", (_event, { symbol, payload }) =>
    forward(`/paper/holdings/${encodeURIComponent(symbol)}/sell`, payload));
  ipcMain.handle("api:etf:reference", () => forward("/etf-screener/reference"));
  ipcMain.handle("api:etf:universe", () => forward("/etf-screener/universe"));
  ipcMain.handle("api:etf:screen", (_event, body) => forward("/etf-screener/screen", body));
  ipcMain.handle("api:etf:refresh", (_event, body) => forward("/etf-screener/refresh", body));
  ipcMain.handle("api:etf:detail", (_event, { ticker }) => forward(`/etf-screener/etf/${encodeURIComponent(ticker)}`));
  ipcMain.handle("api:etf:watchlist:get", () => forward("/etf-screener/watchlist"));
  ipcMain.handle("api:etf:watchlist:set", (_event, body) => forward("/etf-screener/watchlist", body));
  ipcMain.handle("api:ics:holdings", (_event, { ticker }) => forward(`/screener/etf/${encodeURIComponent(ticker)}/holdings`));
  ipcMain.handle("api:ics:batch", (_event, body) => forward("/screener/batch", body));
  ipcMain.handle("api:market:pulse", (_event, { watch }) =>
    forward(`/market/pulse${watch ? `?watch=${encodeURIComponent(watch)}` : ""}`));
  ipcMain.handle("api:export", (_event, { text }) => {
    clipboard.writeText(String(text ?? ""));
    return true;
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    backgroundColor: "#0a0a0f", // obsidian black — pre-paint bg, no blue tint
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // glossary links etc. open in the OS browser, never in-app windows
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:") || url.startsWith("http:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  if (DEV_SERVER_URL) {
    win.loadURL(DEV_SERVER_URL);
  } else if (app.isPackaged) {
    win.loadFile(path.join(process.resourcesPath, "frontend-dist", "index.html"));
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
