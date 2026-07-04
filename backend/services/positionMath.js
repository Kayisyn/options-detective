// Position-assembly helpers shared by the Detector and the Calculator.
// Selection and aggregation only — every priced number still comes from the
// Python engine or the quote feed.

function legSign(type) {
  return type.startsWith("long") ? 1 : -1;
}

// Leg objects carry UI metadata (iv, spreadPct, volume...); the engine only
// wants the structural fields.
function engineLegs(legs) {
  return legs.map((leg) => (leg.type.endsWith("stock")
    ? { type: leg.type, price: leg.price, qty: leg.qty }
    : { type: leg.type, strike: leg.strike, price: leg.price, qty: leg.qty }));
}

// entry cost of one unit of the position: positive = debit, negative = credit
function totalDebitOf(legs) {
  let total = 0;
  for (const leg of legs) {
    const scale = leg.type.endsWith("stock") ? leg.qty : leg.qty * 100;
    total += legSign(leg.type) * leg.price * scale;
  }
  return Math.round(total * 100) / 100;
}

// Position greeks in dollar terms ($ per $1 move, $ per day, ...).
// legGreeks[i] is the engine's per-share greek dict for option leg i, or
// null for stock legs (delta 1 per share, everything else 0).
function netGreeksOf(legs, legGreeks) {
  const net = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  legs.forEach((leg, i) => {
    const sign = legSign(leg.type);
    if (leg.type.endsWith("stock")) {
      net.delta += sign * leg.qty;
      return;
    }
    const g = legGreeks[i];
    if (!g) return;
    for (const key of Object.keys(net)) {
      net[key] += sign * leg.qty * 100 * g[key];
    }
  });
  for (const key of Object.keys(net)) net[key] = Math.round(net[key] * 100) / 100;
  return net;
}

// Capital needed to hold one unit. strategyType may be null (Calculator on
// ad-hoc legs); the fallback uses max loss when defined, else a flagged
// margin proxy.
function capitalRequiredOf(strategyType, legs, maxLoss, spot, totalDebit) {
  if (strategyType === "cash_secured_put") {
    const strike = legs.find((l) => l.type === "short_put").strike;
    return { amount: strike * 100 + totalDebit, approximate: false }; // totalDebit is negative (credit)
  }
  if (strategyType === "covered_call") {
    return { amount: totalDebit, approximate: false }; // stock cost less premium
  }
  if (Number.isFinite(maxLoss)) {
    return { amount: Math.max(maxLoss, totalDebit > 0 ? totalDebit : maxLoss), approximate: false };
  }
  // undefined risk: rough reg-T style proxy, clearly flagged
  return { amount: 0.2 * spot * 100, approximate: true };
}

module.exports = { legSign, engineLegs, totalDebitOf, netGreeksOf, capitalRequiredOf };
