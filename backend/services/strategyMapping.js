// Strategy eligibility: {directionalView, ivRank, constraints} -> strategies.
// Table from docs/strategy-mapping.md, restricted to the seven v1 strategies.
// Pure module — no I/O.

const ALL_STRATEGIES = [
  "covered_call",
  "cash_secured_put",
  "call_vertical",
  "put_vertical",
  "iron_condor",
  "long_straddle",
  "short_strangle",
];

const UNDEFINED_RISK = new Set(["short_strangle"]);

const TABLE = {
  bullish: {
    high: ["call_vertical", "cash_secured_put", "covered_call"],
    low: ["call_vertical"],
  },
  bearish: {
    high: ["put_vertical", "iron_condor", "short_strangle"],
    low: ["put_vertical"],
  },
  neutral: {
    high: ["iron_condor", "short_strangle", "covered_call", "cash_secured_put"],
    low: ["long_straddle"],
  },
  income: {
    high: ["covered_call", "cash_secured_put", "iron_condor", "short_strangle"],
    low: ["covered_call", "cash_secured_put"],
  },
};

// null ivRank (proxy unavailable) is treated as mid: screen the union and
// let the composite score sort it out.
function ivBand(ivRank) {
  if (ivRank === null || ivRank === undefined) return "mid";
  if (ivRank >= 70) return "high";
  if (ivRank <= 30) return "low";
  return "mid";
}

function eligibleStrategies(directionalView, ivRank,
                            { definedRiskOnly = false, allowedStrategies = [] } = {}) {
  const rows = TABLE[directionalView];
  if (!rows) {
    throw new Error(`unknown directionalView ${JSON.stringify(directionalView)}; `
      + `expected one of ${Object.keys(TABLE).join(", ")}`);
  }
  const band = ivBand(ivRank);
  let list = band === "mid"
    ? [...new Set([...rows.high, ...rows.low])]
    : [...rows[band]];
  if (definedRiskOnly) {
    list = list.filter((s) => !UNDEFINED_RISK.has(s));
  }
  if (Array.isArray(allowedStrategies) && allowedStrategies.length > 0) {
    const allowed = new Set(allowedStrategies);
    list = list.filter((s) => allowed.has(s));
  }
  return list;
}

module.exports = { ALL_STRATEGIES, UNDEFINED_RISK, ivBand, eligibleStrategies, TABLE };
