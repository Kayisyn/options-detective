// yfinance adapter: fetch underlying price, option chains for the next 4-6
// expirations, IV rank; normalize to the schema in docs/api-schema.md.
//
// Phase 2 responsibilities:
//   getChain(symbol, expiration)  -> { calls: [...], puts: [...] }
//   getUnderlying(symbol)         -> { price, volume, ivRank, lastTrade }
//   getIvRank(symbol)             -> 0-100
//   - 60-second cache per symbol, invalidated on user refresh
//   - liquidity gates: drop contracts with volume < 50 or OI < 100
//   - every quote carries a timestamp; dataAgeSeconds computed at read time

module.exports = {};
