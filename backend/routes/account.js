// v1.7.2 account data management (mounted behind requireAccount):
//   GET  /account/export -> full backup of the active account's data files
//   POST /account/import -> restore a backup (overwrites current data)
//   POST /account/clear  -> erase the active account's data files
//
// The three per-account JSON files (trades/paper/etf) pass through verbatim,
// so a backup made today restores byte-identical data — no re-serialization
// of trade math. Import validates shape only; values were backend-computed
// when the backup was made.
const { Router } = require("express");
const fs = require("fs");
const path = require("path");

const session = require("../services/session");

const router = Router();
const EXPORT_FORMAT = 1;
const FILES = { trades: "trades.json", paper: "paper.json", etf: "etf.json" };

function readData() {
  const dir = session.activeDataDir();
  const out = {};
  for (const [key, name] of Object.entries(FILES)) {
    try {
      out[key] = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    } catch {
      out[key] = null; // file absent (fresh account) or unreadable
    }
  }
  return out;
}

function writeFileAtomic(file, value) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

router.get("/export", (_req, res) => {
  res.json({
    app: "option-obelisk",
    format: EXPORT_FORMAT,
    exportedAt: new Date().toISOString(),
    data: readData(),
  });
});

router.post("/import", (req, res) => {
  const body = req.body || {};
  if (body.app !== "option-obelisk" || body.format !== EXPORT_FORMAT) {
    return res.status(400).json({
      error: "Not an Option Obelisk backup (missing app/format marker)",
    });
  }
  const data = body.data || {};
  if (data.trades !== null && data.trades !== undefined && !Array.isArray(data.trades)) {
    return res.status(400).json({ error: "backup damaged: trades must be a list" });
  }
  for (const key of ["paper", "etf"]) {
    if (data[key] !== null && data[key] !== undefined && typeof data[key] !== "object") {
      return res.status(400).json({ error: `backup damaged: ${key} must be an object` });
    }
  }
  const dir = session.activeDataDir();
  fs.mkdirSync(dir, { recursive: true });
  const restored = [];
  for (const [key, name] of Object.entries(FILES)) {
    if (data[key] === null || data[key] === undefined) continue; // absent in backup: leave as-is
    writeFileAtomic(path.join(dir, name), data[key]);
    restored.push(key);
  }
  res.json({ ok: true, restored, trades: Array.isArray(data.trades) ? data.trades.length : 0 });
});

router.post("/clear", (_req, res) => {
  const dir = session.activeDataDir();
  for (const name of Object.values(FILES)) {
    try {
      fs.rmSync(path.join(dir, name), { force: true });
    } catch {
      // best-effort; a locked file will surface on the next read anyway
    }
  }
  res.json({ ok: true });
});

module.exports = router;
