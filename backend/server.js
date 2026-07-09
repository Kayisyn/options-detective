const express = require("express");
const cors = require("cors");

const detectRouter = require("./routes/detect");
const calculateRouter = require("./routes/calculate");
const recommendRouter = require("./routes/recommend");
const dataRouter = require("./routes/data");
const journalRouter = require("./routes/journal");
const paperRouter = require("./routes/paper");
const etfRouter = require("./routes/etf");
const screenerRouter = require("./routes/screener");
const { callEngine, engineClient } = require("./services/mathEngine");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Proves the whole pipeline: Express up + Python math engine reachable.
app.get("/health", async (_req, res) => {
  try {
    const sample = await callEngine("bs_call_price", {
      S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2,
    });
    res.json({ status: "ok", mathEngine: "ok", sampleBsCall: sample });
  } catch (err) {
    res.status(500).json({
      status: "degraded",
      mathEngine: "unreachable",
      error: String(err.message || err),
    });
  }
});

app.use("/detect", detectRouter);
app.use("/calculate", calculateRouter);
app.use("/recommend", recommendRouter);
app.use("/data", dataRouter);
app.use("/journal", journalRouter);
app.use("/trades", journalRouter); // pre-v1.1 alias (old bridge builds)
app.use("/paper", paperRouter);
app.use("/etf-screener", etfRouter);
app.use("/screener", screenerRouter);

// JSON everywhere: unknown routes and unhandled errors never leak HTML.
app.use((req, res) => {
  res.status(404).json({ error: `no route ${req.method} ${req.path}` });
});
// eslint-disable-next-line no-unused-vars -- express identifies error
// middleware by arity, the 4th parameter must exist
app.use((err, _req, res, _next) => {
  console.error("[server] unhandled:", err);
  res.status(500).json({ error: "internal error; see server logs" });
});

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`options-detective backend listening on http://localhost:${PORT}`);
  });
  const shutdown = () => {
    engineClient.shutdown(); // stop the warm Python child
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2_000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

module.exports = app;
