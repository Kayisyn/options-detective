// Curated ETF holdings (v1.3.0 §1, Option B — static curated JSON).
//
// Reality check on the roadmap's Option A: yfinance funds_data exposes only
// the TOP 10 holdings, not full constituent lists, so "fetch all holdings"
// is not available from free data. We therefore invert the roadmap's
// preference: curated static top holdings are PRIMARY for the flagship
// equity ETFs (below), and the yfinance top-10 is the dynamic FALLBACK for
// universe ETFs without a curated set (see icsScreener.js).
//
// Weights are approximate (index weights drift daily) and disclosed with an
// as-of date in the UI. Sets are keyed by the underlying index family so
// ETFs tracking the same index share one list. Sectors use one consistent
// label set so the ICS sector filter behaves.

const AS_OF = "2026-07"; // refresh cadence: monthly-ish, like the universe

// symbol -> sector, declared once so every set stays consistent
const SECTOR_OF = {
  NVDA: "Technology", AAPL: "Technology", MSFT: "Technology", AVGO: "Technology",
  ORCL: "Technology", CRM: "Technology", CSCO: "Technology", AMD: "Technology",
  ACN: "Technology", ADBE: "Technology", IBM: "Technology", NOW: "Technology",
  TXN: "Technology", QCOM: "Technology", INTU: "Technology", AMAT: "Technology",
  PLTR: "Technology", ANET: "Technology", MU: "Technology", LRCX: "Technology",
  KLAC: "Technology", MRVL: "Technology", INTC: "Technology", ADI: "Technology",
  NXPI: "Technology", MCHP: "Technology", ON: "Technology", SNPS: "Technology",
  CDNS: "Technology", PANW: "Technology", CRWD: "Technology", WDAY: "Technology",
  AMZN: "Consumer", TSLA: "Consumer", HD: "Consumer", MCD: "Consumer",
  BKNG: "Consumer", DIS: "Communication",
  META: "Communication", GOOGL: "Communication", GOOG: "Communication",
  NFLX: "Communication", TMUS: "Communication", VZ: "Communication",
  COST: "Consumer Staples", WMT: "Consumer Staples", PG: "Consumer Staples",
  KO: "Consumer Staples", PEP: "Consumer Staples",
  LLY: "Healthcare", UNH: "Healthcare", JNJ: "Healthcare", ABBV: "Healthcare",
  MRK: "Healthcare", TMO: "Healthcare", ABT: "Healthcare", ISRG: "Healthcare",
  AMGN: "Healthcare", DHR: "Healthcare", PFE: "Healthcare", BSX: "Healthcare",
  VRTX: "Healthcare", SYK: "Healthcare", GILD: "Healthcare", MDT: "Healthcare",
  BMY: "Healthcare", CI: "Healthcare", ELV: "Healthcare", ZTS: "Healthcare",
  REGN: "Healthcare", ALNY: "Healthcare", MRNA: "Healthcare", BIIB: "Healthcare",
  INCY: "Healthcare", NBIX: "Healthcare", SRPT: "Healthcare", BMRN: "Healthcare",
  EXEL: "Healthcare",
  "BRK-B": "Financials", JPM: "Financials", V: "Financials", MA: "Financials",
  BAC: "Financials", WFC: "Financials", GS: "Financials", AXP: "Financials",
  MS: "Financials", C: "Financials", SPGI: "Financials", BLK: "Financials",
  SCHW: "Financials", CB: "Financials", PGR: "Financials",
  XOM: "Energy", CVX: "Energy", COP: "Energy", WMB: "Energy", EOG: "Energy",
  KMI: "Energy", SLB: "Energy", PSX: "Energy", MPC: "Energy", OKE: "Energy",
  LIN: "Materials",
};

// [symbol, approxWeight] — descending by weight
const HOLDING_SETS = {
  NASDAQ100: [
    ["NVDA", 0.090], ["AAPL", 0.081], ["MSFT", 0.079], ["AMZN", 0.055],
    ["AVGO", 0.050], ["META", 0.047], ["TSLA", 0.031], ["NFLX", 0.030],
    ["GOOGL", 0.027], ["GOOG", 0.026], ["COST", 0.026], ["PLTR", 0.017],
    ["AMD", 0.016], ["CSCO", 0.016], ["TMUS", 0.014], ["INTU", 0.013],
    ["LIN", 0.012], ["PEP", 0.011], ["QCOM", 0.010], ["ISRG", 0.010],
    ["TXN", 0.010], ["AMAT", 0.009], ["BKNG", 0.009], ["ADBE", 0.009],
    ["AMGN", 0.008],
  ],
  SP500: [
    ["NVDA", 0.070], ["MSFT", 0.064], ["AAPL", 0.059], ["AMZN", 0.040],
    ["META", 0.030], ["AVGO", 0.025], ["GOOGL", 0.021], ["TSLA", 0.018],
    ["GOOG", 0.017], ["BRK-B", 0.016], ["JPM", 0.015], ["LLY", 0.014],
    ["V", 0.013], ["UNH", 0.012], ["XOM", 0.011], ["MA", 0.010],
    ["COST", 0.010], ["NFLX", 0.009], ["WMT", 0.009], ["PG", 0.009],
    ["JNJ", 0.008], ["HD", 0.008], ["ABBV", 0.007], ["BAC", 0.007],
    ["ORCL", 0.007],
  ],
  US_TECH: [
    ["NVDA", 0.168], ["AAPL", 0.153], ["MSFT", 0.099], ["AVGO", 0.045],
    ["ORCL", 0.030], ["CRM", 0.020], ["CSCO", 0.020], ["AMD", 0.020],
    ["ACN", 0.018], ["ADBE", 0.018], ["IBM", 0.017], ["NOW", 0.015],
    ["TXN", 0.014], ["QCOM", 0.013], ["INTU", 0.013], ["AMAT", 0.012],
    ["PLTR", 0.012], ["ANET", 0.010], ["MU", 0.010], ["LRCX", 0.009],
  ],
  SEMIS: [
    ["NVDA", 0.085], ["AVGO", 0.080], ["AMD", 0.075], ["QCOM", 0.060],
    ["TXN", 0.060], ["LRCX", 0.045], ["AMAT", 0.045], ["KLAC", 0.040],
    ["MU", 0.040], ["MRVL", 0.040], ["INTC", 0.040], ["ADI", 0.040],
    ["NXPI", 0.020], ["MCHP", 0.020], ["ON", 0.020],
  ],
  US_GROWTH: [
    ["NVDA", 0.110], ["MSFT", 0.100], ["AAPL", 0.095], ["AMZN", 0.060],
    ["META", 0.045], ["AVGO", 0.040], ["GOOGL", 0.030], ["TSLA", 0.025],
    ["GOOG", 0.025], ["NFLX", 0.015], ["COST", 0.015], ["LLY", 0.015],
    ["V", 0.014], ["MA", 0.012], ["ORCL", 0.010], ["CRM", 0.009],
    ["AMD", 0.009], ["ADBE", 0.007], ["NOW", 0.007], ["ISRG", 0.007],
  ],
  US_VALUE: [
    ["BRK-B", 0.035], ["JPM", 0.030], ["XOM", 0.025], ["UNH", 0.020],
    ["JNJ", 0.020], ["WMT", 0.018], ["PG", 0.018], ["HD", 0.017],
    ["ABBV", 0.016], ["BAC", 0.015], ["CVX", 0.013], ["KO", 0.012],
    ["MRK", 0.011], ["CSCO", 0.011], ["PEP", 0.010], ["WFC", 0.010],
    ["MCD", 0.009], ["IBM", 0.009], ["DIS", 0.008], ["GS", 0.008],
  ],
  HIGH_DIVIDEND: [
    ["JPM", 0.035], ["XOM", 0.028], ["JNJ", 0.024], ["WMT", 0.022],
    ["PG", 0.022], ["ABBV", 0.020], ["HD", 0.020], ["BAC", 0.018],
    ["KO", 0.016], ["CVX", 0.016], ["MRK", 0.014], ["PEP", 0.013],
    ["MCD", 0.012], ["WFC", 0.012], ["VZ", 0.011],
  ],
  DIVIDEND_GROWTH: [
    ["AAPL", 0.045], ["MSFT", 0.045], ["AVGO", 0.040], ["JPM", 0.035],
    ["LLY", 0.030], ["V", 0.028], ["XOM", 0.025], ["MA", 0.023],
    ["UNH", 0.020], ["COST", 0.020], ["WMT", 0.020], ["JNJ", 0.019],
    ["PG", 0.019], ["HD", 0.018], ["ABBV", 0.016],
  ],
  US_HEALTHCARE: [
    ["LLY", 0.110], ["UNH", 0.070], ["JNJ", 0.065], ["ABBV", 0.055],
    ["MRK", 0.040], ["TMO", 0.035], ["ABT", 0.035], ["ISRG", 0.035],
    ["AMGN", 0.030], ["DHR", 0.025], ["PFE", 0.025], ["BSX", 0.025],
    ["VRTX", 0.020], ["SYK", 0.020], ["GILD", 0.020], ["MDT", 0.018],
    ["BMY", 0.015], ["CI", 0.014], ["ELV", 0.012], ["ZTS", 0.012],
  ],
  US_FINANCIALS: [
    ["JPM", 0.085], ["BRK-B", 0.080], ["V", 0.070], ["MA", 0.060],
    ["BAC", 0.045], ["WFC", 0.035], ["GS", 0.025], ["AXP", 0.025],
    ["MS", 0.025], ["C", 0.020], ["SPGI", 0.020], ["BLK", 0.018],
    ["SCHW", 0.018], ["CB", 0.015], ["PGR", 0.015],
  ],
  BIOTECH: [
    ["GILD", 0.085], ["VRTX", 0.080], ["AMGN", 0.080], ["REGN", 0.070],
    ["ALNY", 0.045], ["BIIB", 0.030], ["MRNA", 0.020], ["INCY", 0.020],
    ["NBIX", 0.020], ["BMRN", 0.020], ["SRPT", 0.015], ["EXEL", 0.015],
  ],
  SOFTWARE: [
    ["MSFT", 0.090], ["ORCL", 0.085], ["CRM", 0.080], ["NOW", 0.070],
    ["PLTR", 0.065], ["ADBE", 0.060], ["INTU", 0.055], ["PANW", 0.030],
    ["CRWD", 0.030], ["SNPS", 0.025], ["CDNS", 0.025], ["WDAY", 0.020],
  ],
  US_ENERGY: [
    ["XOM", 0.220], ["CVX", 0.140], ["COP", 0.070], ["WMB", 0.040],
    ["EOG", 0.040], ["KMI", 0.030], ["SLB", 0.030], ["PSX", 0.030],
    ["MPC", 0.030], ["OKE", 0.030],
  ],
};

// ETF -> index family. VTI's top of book is ~the S&P 500 top names at
// slightly diluted weights — close enough for discovery, and disclosed
// as approximate.
const ETF_TO_SET = {
  QQQ: "NASDAQ100",
  SPY: "SP500", VOO: "SP500", IVV: "SP500", VTI: "SP500",
  VGT: "US_TECH", IYW: "US_TECH",
  SOXX: "SEMIS",
  VUG: "US_GROWTH", IWF: "US_GROWTH",
  VTV: "US_VALUE", IWD: "US_VALUE",
  VYM: "HIGH_DIVIDEND",
  VIG: "DIVIDEND_GROWTH",
  VHT: "US_HEALTHCARE",
  VFH: "US_FINANCIALS",
  IBB: "BIOTECH",
  IGV: "SOFTWARE",
  VDE: "US_ENERGY",
};

function curatedHoldingsFor(ticker) {
  const setName = ETF_TO_SET[String(ticker || "").toUpperCase()];
  if (!setName) return null;
  return {
    source: "curated",
    asOf: AS_OF,
    holdings: HOLDING_SETS[setName].map(([symbol, weight], i) => ({
      symbol,
      weight,
      sector: SECTOR_OF[symbol] ?? null,
      rank: i + 1,
    })),
  };
}

const CURATED_TICKERS = Object.keys(ETF_TO_SET);

module.exports = { curatedHoldingsFor, CURATED_TICKERS, HOLDING_SETS, SECTOR_OF, AS_OF };
