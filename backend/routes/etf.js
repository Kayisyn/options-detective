// ETF screener API (v2.0 §2.7, adapted to the single-user stores).
//   GET  /etf-screener/universe    -> merged static + cached metrics
//   GET  /etf-screener/reference   -> sectors, asset classes, presets
//   POST /etf-screener/screen      -> { filters, strategy, limit } -> ranked
//   POST /etf-screener/refresh     -> { tickers? } fetch live metrics
//   GET  /etf-screener/etf/:ticker -> detail + per-strategy scores
//   GET  /etf-screener/watchlist   -> saved ETFs (merged)
//   POST /etf-screener/watchlist   -> { ticker, action: "add"|"remove" }
const { Router } = require("express");
const { screener } = require("../services/etfScreener");

const router = Router();

function send(res, fn) {
  try {
    res.json(fn());
  } catch (err) {
    if (err instanceof TypeError) res.status(400).json({ error: err.message });
    else res.status(500).json({ error: String(err.message || err) });
  }
}

router.get("/universe", (_req, res) => send(res, () => ({ etfs: screener.universe() })));
router.get("/reference", (_req, res) => send(res, () => screener.reference()));

router.post("/screen", (req, res) => send(res, () => screener.screen(req.body || {})));

router.post("/refresh", async (req, res) => {
  try {
    res.json(await screener.refresh(req.body?.tickers));
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
});

router.get("/etf/:ticker", (req, res) => send(res, () => {
  const etf = screener.getEtf(req.params.ticker);
  if (!etf) {
    res.status(404);
    return { error: `unknown ETF ticker: ${req.params.ticker}` };
  }
  return { etf };
}));

router.get("/watchlist", (_req, res) => send(res, () => ({ etfs: screener.watchlist() })));

router.post("/watchlist", (req, res) => send(res, () => ({
  watchlist: screener.toggleWatchlist(req.body?.ticker, req.body?.action),
})));

module.exports = router;
