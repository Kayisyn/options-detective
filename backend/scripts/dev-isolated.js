// Dev-only launcher: run the backend on a second port with a throwaway data
// dir so a test stack can run alongside the installed app (which owns 3001
// and the real data dir). Used by the "backend-alt" launch.json entry.
const path = require("node:path");
const os = require("node:os");

process.env.PORT = process.env.PORT || "3002";
process.env.OD_DATA_DIR =
  process.env.OD_DATA_DIR || path.join(os.tmpdir(), "od-dev-data");

// server.js only self-listens when it is the main module; when required it
// exports the express app, so listen here.
const app = require("../server.js");
const port = Number(process.env.PORT);
app.listen(port, () => {
  console.log(`[dev-isolated] backend on http://localhost:${port} data=${process.env.OD_DATA_DIR}`);
});
