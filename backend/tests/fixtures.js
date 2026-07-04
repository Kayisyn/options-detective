// Synthetic, liquidity-gated market data for offline Detector tests.
// Crude but well-behaved marks: intrinsic + a bell-shaped time value around
// ATM, so debit spreads always cost something and condors always collect.

function timeValue(strike, spot) {
  return 8 * Math.exp(-(((strike - spot) / 15) ** 2));
}

function contract(strike, mid, iv) {
  return {
    strike,
    bid: Math.round((mid - 0.05) * 100) / 100,
    ask: Math.round((mid + 0.05) * 100) / 100,
    mid: Math.round(mid * 100) / 100,
    volume: 600,
    openInterest: 2000,
    impliedVolatility: iv,
    spreadPct: 0.02,
    timestamp: null,
    illiquid: false,
  };
}

function syntheticChain({ spot = 100, iv = 0.25, strikes } = {}) {
  const ks = strikes
    || Array.from({ length: 13 }, (_, i) => 70 + i * 5); // 70..130 step 5
  return {
    calls: ks.map((k) => contract(k, Math.max(spot - k, 0) + timeValue(k, spot), iv)),
    puts: ks.map((k) => contract(k, Math.max(k - spot, 0) + timeValue(k, spot), iv)),
  };
}

function isoDatePlusDays(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function syntheticMarketData({ spot = 100, iv = 0.25, ivRank = 80, dtes = [30, 60] } = {}) {
  const expirations = dtes.map(isoDatePlusDays);
  const chains = {};
  for (const exp of expirations) chains[exp] = syntheticChain({ spot, iv });
  return {
    symbol: "TEST",
    price: spot,
    atmIv: iv,
    ivRank,
    ivRankMethod: "fixture",
    expirations,
    chains,
    fetchedAt: new Date().toISOString(),
    dataAgeSeconds: 0,
    stale: false,
    liquidity: { gates: {}, total: 0, kept: 0, dropped: {} },
  };
}

function fakeDataLayer(data) {
  return { getMarketData: async () => data };
}

module.exports = { syntheticChain, syntheticMarketData, fakeDataLayer, isoDatePlusDays };
