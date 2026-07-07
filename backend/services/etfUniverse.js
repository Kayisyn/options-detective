// Static ETF universe (v2.0 §2.3, recommended "static list + yfinance"
// approach). Reference fields — issuer, sector, asset class, expense ratio,
// approximate AUM — are exactly the data the brief says to source statically
// and refresh at most monthly; they change slowly and hardcoding a curated
// list is the honest, reliable option. Dynamic fields (price, IV, premium,
// YTD) are fetched live and merged on top (see etfScreener.js).
//
// AUM is in USD billions, approximate. expenseRatio is a fraction
// (0.0003 = 0.03%). Curated for high liquidity / liquid options across
// Vanguard + iShares.

const ETF_UNIVERSE = [
  // --- Vanguard: broad US equity ---
  { ticker: "VOO", name: "Vanguard S&P 500", issuer: "Vanguard", sector: "US Equity - Broad", assetClass: "Equity", expenseRatio: 0.0003, aumBillions: 1300 },
  { ticker: "VTI", name: "Vanguard Total Stock Market", issuer: "Vanguard", sector: "US Equity - Broad", assetClass: "Equity", expenseRatio: 0.0003, aumBillions: 1500 },
  { ticker: "VUG", name: "Vanguard Growth", issuer: "Vanguard", sector: "US Equity - Growth", assetClass: "Equity", expenseRatio: 0.0004, aumBillions: 140 },
  { ticker: "VTV", name: "Vanguard Value", issuer: "Vanguard", sector: "US Equity - Value", assetClass: "Equity", expenseRatio: 0.0004, aumBillions: 130 },
  { ticker: "VB", name: "Vanguard Small-Cap", issuer: "Vanguard", sector: "US Equity - Small Cap", assetClass: "Equity", expenseRatio: 0.0005, aumBillions: 55 },
  { ticker: "VO", name: "Vanguard Mid-Cap", issuer: "Vanguard", sector: "US Equity - Mid Cap", assetClass: "Equity", expenseRatio: 0.0004, aumBillions: 75 },
  // --- Vanguard: sectors ---
  { ticker: "VGT", name: "Vanguard Information Technology", issuer: "Vanguard", sector: "Technology", assetClass: "Equity", expenseRatio: 0.0010, aumBillions: 75 },
  { ticker: "VHT", name: "Vanguard Health Care", issuer: "Vanguard", sector: "Healthcare", assetClass: "Equity", expenseRatio: 0.0009, aumBillions: 18 },
  { ticker: "VFH", name: "Vanguard Financials", issuer: "Vanguard", sector: "Financials", assetClass: "Equity", expenseRatio: 0.0009, aumBillions: 11 },
  { ticker: "VDE", name: "Vanguard Energy", issuer: "Vanguard", sector: "Energy", assetClass: "Equity", expenseRatio: 0.0010, aumBillions: 8 },
  { ticker: "VIS", name: "Vanguard Industrials", issuer: "Vanguard", sector: "Industrials", assetClass: "Equity", expenseRatio: 0.0010, aumBillions: 5 },
  { ticker: "VAW", name: "Vanguard Materials", issuer: "Vanguard", sector: "Materials", assetClass: "Equity", expenseRatio: 0.0010, aumBillions: 4 },
  { ticker: "VPU", name: "Vanguard Utilities", issuer: "Vanguard", sector: "Utilities", assetClass: "Equity", expenseRatio: 0.0010, aumBillions: 7 },
  { ticker: "VCR", name: "Vanguard Consumer Discretionary", issuer: "Vanguard", sector: "Consumer", assetClass: "Equity", expenseRatio: 0.0010, aumBillions: 6 },
  { ticker: "VDC", name: "Vanguard Consumer Staples", issuer: "Vanguard", sector: "Consumer", assetClass: "Equity", expenseRatio: 0.0010, aumBillions: 7 },
  { ticker: "VOX", name: "Vanguard Communication Services", issuer: "Vanguard", sector: "Communication", assetClass: "Equity", expenseRatio: 0.0010, aumBillions: 4 },
  { ticker: "VNQ", name: "Vanguard Real Estate", issuer: "Vanguard", sector: "Real Estate", assetClass: "Equity", expenseRatio: 0.0013, aumBillions: 34 },
  // --- Vanguard: dividend / intl / bonds ---
  { ticker: "VYM", name: "Vanguard High Dividend Yield", issuer: "Vanguard", sector: "Dividend", assetClass: "Equity", expenseRatio: 0.0006, aumBillions: 55 },
  { ticker: "VIG", name: "Vanguard Dividend Appreciation", issuer: "Vanguard", sector: "Dividend", assetClass: "Equity", expenseRatio: 0.0005, aumBillions: 80 },
  { ticker: "VEA", name: "Vanguard FTSE Developed Markets", issuer: "Vanguard", sector: "International", assetClass: "Equity", expenseRatio: 0.0005, aumBillions: 130 },
  { ticker: "VWO", name: "Vanguard FTSE Emerging Markets", issuer: "Vanguard", sector: "Emerging Markets", assetClass: "Equity", expenseRatio: 0.0008, aumBillions: 80 },
  { ticker: "VXUS", name: "Vanguard Total International Stock", issuer: "Vanguard", sector: "International", assetClass: "Equity", expenseRatio: 0.0007, aumBillions: 70 },
  { ticker: "VGK", name: "Vanguard FTSE Europe", issuer: "Vanguard", sector: "International", assetClass: "Equity", expenseRatio: 0.0009, aumBillions: 20 },
  { ticker: "BND", name: "Vanguard Total Bond Market", issuer: "Vanguard", sector: "Bonds", assetClass: "Bond", expenseRatio: 0.0003, aumBillions: 120 },
  { ticker: "BNDX", name: "Vanguard Total International Bond", issuer: "Vanguard", sector: "Bonds", assetClass: "Bond", expenseRatio: 0.0007, aumBillions: 55 },
  // --- iShares: broad US equity ---
  { ticker: "IVV", name: "iShares Core S&P 500", issuer: "iShares", sector: "US Equity - Broad", assetClass: "Equity", expenseRatio: 0.0003, aumBillions: 500 },
  { ticker: "IWM", name: "iShares Russell 2000", issuer: "iShares", sector: "US Equity - Small Cap", assetClass: "Equity", expenseRatio: 0.0019, aumBillions: 65 },
  { ticker: "IWF", name: "iShares Russell 1000 Growth", issuer: "iShares", sector: "US Equity - Growth", assetClass: "Equity", expenseRatio: 0.0019, aumBillions: 95 },
  { ticker: "IWD", name: "iShares Russell 1000 Value", issuer: "iShares", sector: "US Equity - Value", assetClass: "Equity", expenseRatio: 0.0019, aumBillions: 60 },
  // --- iShares: sectors / thematic ---
  { ticker: "SOXX", name: "iShares Semiconductor", issuer: "iShares", sector: "Technology", assetClass: "Equity", expenseRatio: 0.0035, aumBillions: 14 },
  { ticker: "IYW", name: "iShares U.S. Technology", issuer: "iShares", sector: "Technology", assetClass: "Equity", expenseRatio: 0.0039, aumBillions: 18 },
  { ticker: "IGV", name: "iShares Expanded Tech-Software", issuer: "iShares", sector: "Technology", assetClass: "Equity", expenseRatio: 0.0041, aumBillions: 8 },
  { ticker: "IBB", name: "iShares Biotechnology", issuer: "iShares", sector: "Healthcare", assetClass: "Equity", expenseRatio: 0.0045, aumBillions: 8 },
  { ticker: "IYR", name: "iShares U.S. Real Estate", issuer: "iShares", sector: "Real Estate", assetClass: "Equity", expenseRatio: 0.0039, aumBillions: 5 },
  { ticker: "ITB", name: "iShares U.S. Home Construction", issuer: "iShares", sector: "Consumer", assetClass: "Equity", expenseRatio: 0.0039, aumBillions: 3 },
  { ticker: "ICLN", name: "iShares Global Clean Energy", issuer: "iShares", sector: "Energy", assetClass: "Equity", expenseRatio: 0.0041, aumBillions: 2 },
  // --- iShares: international ---
  { ticker: "EFA", name: "iShares MSCI EAFE", issuer: "iShares", sector: "International", assetClass: "Equity", expenseRatio: 0.0033, aumBillions: 50 },
  { ticker: "EEM", name: "iShares MSCI Emerging Markets", issuer: "iShares", sector: "Emerging Markets", assetClass: "Equity", expenseRatio: 0.0070, aumBillions: 18 },
  { ticker: "IEMG", name: "iShares Core MSCI Emerging Markets", issuer: "iShares", sector: "Emerging Markets", assetClass: "Equity", expenseRatio: 0.0009, aumBillions: 80 },
  { ticker: "IEFA", name: "iShares Core MSCI EAFE", issuer: "iShares", sector: "International", assetClass: "Equity", expenseRatio: 0.0007, aumBillions: 110 },
  // --- iShares: bonds ---
  { ticker: "AGG", name: "iShares Core U.S. Aggregate Bond", issuer: "iShares", sector: "Bonds", assetClass: "Bond", expenseRatio: 0.0003, aumBillions: 110 },
  { ticker: "TLT", name: "iShares 20+ Year Treasury Bond", issuer: "iShares", sector: "Bonds", assetClass: "Bond", expenseRatio: 0.0015, aumBillions: 50 },
  { ticker: "IEF", name: "iShares 7-10 Year Treasury Bond", issuer: "iShares", sector: "Bonds", assetClass: "Bond", expenseRatio: 0.0015, aumBillions: 30 },
  { ticker: "LQD", name: "iShares iBoxx Investment Grade Corp Bond", issuer: "iShares", sector: "Bonds", assetClass: "Bond", expenseRatio: 0.0014, aumBillions: 30 },
  { ticker: "HYG", name: "iShares iBoxx High Yield Corp Bond", issuer: "iShares", sector: "Bonds", assetClass: "Bond", expenseRatio: 0.0049, aumBillions: 15 },
  // --- iShares: commodity ---
  { ticker: "IAU", name: "iShares Gold Trust", issuer: "iShares", sector: "Commodity", assetClass: "Commodity", expenseRatio: 0.0025, aumBillions: 30 },
  { ticker: "SLV", name: "iShares Silver Trust", issuer: "iShares", sector: "Commodity", assetClass: "Commodity", expenseRatio: 0.0050, aumBillions: 12 },
];

const SECTORS = [...new Set(ETF_UNIVERSE.map((e) => e.sector))].sort();
const ASSET_CLASSES = [...new Set(ETF_UNIVERSE.map((e) => e.assetClass))].sort();
const TICKERS = ETF_UNIVERSE.map((e) => e.ticker);
const BY_TICKER = new Map(ETF_UNIVERSE.map((e) => [e.ticker, e]));

module.exports = { ETF_UNIVERSE, SECTORS, ASSET_CLASSES, TICKERS, BY_TICKER };
