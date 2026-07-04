const express = require("express");
const cors = require("cors");

const detectRouter = require("./routes/detect");
const calculateRouter = require("./routes/calculate");
const recommendRouter = require("./routes/recommend");
const dataRouter = require("./routes/data");
const { callEngine } = require("./services/mathEngine");

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

const PORT = process.env.PORT || 3001;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`options-detective backend listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
