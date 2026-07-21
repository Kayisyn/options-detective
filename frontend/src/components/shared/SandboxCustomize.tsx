import { useState } from "react";
import { useStore } from "../../store";
import { money } from "../../lib/format";
import { cx } from "../../lib/cx";
import Button from "../ui/Button";
import { FormInput } from "../ui/Input";
import type { PaperHolding, PaperSettings, ThetaMode } from "../../types";

// v1.5.0 Sandbox customization (§8): a collapsible panel of realism knobs
// plus a one-line active-settings badge. Settings persist server-side and
// apply on the next order / mark / expiry pass.

const THETA_LABELS: Record<ThetaMode, string> = {
  normal: "Normal", fast: "Accelerated 2×", slow: "Slow 0.5×",
};

function activeBadge(s: PaperSettings): string {
  const fee = s.commissionEnabled ? `$${s.commissionPerTrade.toFixed(2)}/trade` : "off";
  return `Commission: ${fee} · Theta: ${THETA_LABELS[s.thetaMode]} · Auto-assign: ${s.autoAssign ? "ON" : "OFF"}`;
}

const TIP_KEY = "od.sandboxTip.v1"; // one-time seed-money discoverability tip

export function SandboxCustomize({ settings, accountValue, initialBalance }: {
  settings: PaperSettings;
  accountValue: number;
  initialBalance: number;
}) {
  const update = useStore((st) => st.updatePaperSettings);
  const [open, setOpen] = useState(false);
  const [fee, setFee] = useState(String(settings.commissionPerTrade));
  const [risk, setRisk] = useState(String(settings.maxRiskPct));
  const [tipDismissed, setTipDismissed] = useState(() => {
    try { return localStorage.getItem(TIP_KEY) === "1"; } catch { return true; }
  });

  function dismissTip() {
    try { localStorage.setItem(TIP_KEY, "1"); } catch { /* private mode */ }
    setTipDismissed(true);
  }
  function openPanel() {
    setOpen(true);
    dismissTip();
  }

  const riskDollars = (accountValue * settings.maxRiskPct) / 100;

  return (
    <div className="space-y-2">
      {!tipDismissed && (
        <div className="card-glass flex items-start gap-2 px-4 py-2 text-xs text-content-2"
          data-testid="sandbox-tip">
          <span aria-hidden className="emoji-icon">💡</span>
          <span className="flex-1">
            Customize seed money, commissions, and trading rules with the{" "}
            <span className="text-accent-primary-text">✎</span> pencil below.
          </span>
          <button onClick={dismissTip} aria-label="Dismiss tip"
            className="text-content-3 transition-colors hover:text-content-1">✕</button>
        </div>
      )}
      <div className="card-glass" data-testid="sandbox-customize">
        <button
          onClick={() => (open ? setOpen(false) : openPanel())}
          className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2 text-xs">
            <span className="font-medium uppercase tracking-wide text-heading">Customize</span>
            <span className="font-mono text-content-2" data-testid="sandbox-settings-badge">
              {activeBadge(settings)}
            </span>
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden title="Edit sandbox settings"
              className="text-sm text-accent-primary-text">✎</span>
            <span aria-hidden className={cx(
              "text-content-3 transition-transform duration-200 ease-out-quad",
              open ? "rotate-180" : "rotate-0",
            )}>▾</span>
          </span>
        </button>

        {open && (
          <div className="border-t border-white/10 p-4" data-testid="sandbox-settings-detail">
            <SeedMoney initialBalance={initialBalance} />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {/* Commission */}
          <div className="rounded-md bg-dark-700/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Commission &amp; fees</span>
              <Button
                variant={settings.commissionEnabled ? "secondary" : "ghost"} size="xs"
                data-testid="commission-toggle"
                onClick={() => update({ commissionEnabled: !settings.commissionEnabled })}
              >
                {settings.commissionEnabled ? "On" : "Off"}
              </Button>
            </div>
            <div className={cx("mt-2", !settings.commissionEnabled && "opacity-50")}>
              <FormInput
                label="Fee per trade $" type="number" step="0.01" min="0" value={fee}
                disabled={!settings.commissionEnabled}
                data-testid="commission-input"
                onChange={(e) => setFee(e.target.value)}
                onBlur={() => {
                  const n = Number(fee);
                  if (Number.isFinite(n) && n >= 0) update({ commissionPerTrade: n });
                }}
              />
              <p className="mt-1 text-[11px] text-content-3">
                Charged on entry and exit/settlement, deducted from cash.
              </p>
            </div>
          </div>

          {/* Assignment */}
          <div className="rounded-md bg-dark-700/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Auto-assign at ITM</span>
              <Button
                variant={settings.autoAssign ? "secondary" : "ghost"} size="xs"
                data-testid="autoassign-toggle"
                onClick={() => update({ autoAssign: !settings.autoAssign })}
              >
                {settings.autoAssign ? "On" : "Off"}
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-content-3">
              100% assignment when ITM at expiry. A cash-secured put buys shares
              at the strike (held in the Sandbox); a covered call is called away
              and frees its capital. Off leaves expired positions for you to
              settle manually.
            </p>
          </div>

          {/* Theta */}
          <div className="rounded-md bg-dark-700/50 p-3">
            <div className="text-sm font-medium">Time decay (theta)</div>
            <div className="mt-2 flex gap-1.5">
              {(["normal", "fast", "slow"] as ThetaMode[]).map((mode) => (
                <button
                  key={mode}
                  data-theta-mode={mode}
                  onClick={() => update({ thetaMode: mode })}
                  className={cx(
                    "rounded border px-2 py-1 text-xs transition-all duration-150 ease-out-quad",
                    settings.thetaMode === mode
                      ? "border-accent-primary/60 bg-accent-primary/15 text-accent-primary-text"
                      : "border-dark-600 text-content-3 hover:border-dark-500 hover:text-content-2",
                  )}
                >
                  {THETA_LABELS[mode]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-content-3">
              Warps how fast premium erodes in the theoretical marks. Real expiry
              dates are unchanged.
            </p>
          </div>

          {/* Risk per trade (informational) */}
          <div className="rounded-md bg-dark-700/50 p-3">
            <div className="text-sm font-medium">Max risk per trade</div>
            <div className="mt-2 flex items-end gap-2">
              <FormInput
                label="% of account" type="number" step="0.5" min="0" value={risk}
                containerClassName="flex-1"
                data-testid="risk-input"
                onChange={(e) => setRisk(e.target.value)}
                onBlur={() => {
                  const n = Number(risk);
                  if (Number.isFinite(n) && n > 0 && n <= 100) update({ maxRiskPct: n });
                }}
              />
            </div>
            <p className="mt-2 text-[11px] text-content-3">
              Informational only: {settings.maxRiskPct}% = <b className="text-content-2">{money(riskDollars)}</b> on
              this {money(accountValue)} account.
            </p>
          </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// v1.5.1 seed money: the first section of the panel. Changing the starting
// balance resets the sandbox (archives current trades), so it confirms first
// when positions exist.
function SeedMoney({ initialBalance }: { initialBalance: number }) {
  const resetPaper = useStore((st) => st.resetPaper);
  const tradeCount = useStore((st) => st.paper?.trades.length ?? 0);
  const [value, setValue] = useState(String(initialBalance));
  const [confirming, setConfirming] = useState(false);

  const n = Number(value);
  const valid = Number.isFinite(n) && n >= 500;
  const changed = valid && Math.round(n) !== Math.round(initialBalance);

  function apply() {
    if (!valid) return;
    if (tradeCount > 0 && !confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    resetPaper(Math.round(n));
    setConfirming(false);
  }

  return (
    <div className="rounded-md border border-accent-primary/25 bg-dark-700/50 p-3" data-testid="seed-money">
      <div className="text-sm font-medium">Starting account value</div>
      <p className="mt-0.5 text-[11px] text-content-3">
        Seed money for the sandbox. $500 minimum, no maximum. Changing it resets
        the account{tradeCount > 0 ? ` and archives your ${tradeCount} position${tradeCount === 1 ? "" : "s"}` : ""}.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <FormInput
          label="Starting balance $" type="number" step="1000" min="500"
          value={value} containerClassName="min-w-[9rem] flex-1"
          error={value !== "" && !valid ? "Minimum $500" : undefined}
          data-testid="seed-money-input"
          onChange={(e) => { setValue(e.target.value); setConfirming(false); }}
        />
        <Button variant="ghost" size="sm" data-testid="seed-money-reset"
          onClick={() => { setValue("50000"); setConfirming(false); }}>
          Reset to $50,000
        </Button>
        <Button
          variant={confirming ? "destructive" : "primary"} size="sm"
          disabled={!valid || (!changed && !confirming)}
          data-testid="seed-money-apply" onClick={apply}
        >
          {confirming ? `Confirm, archives ${tradeCount}` : "Apply"}
        </Button>
      </div>
    </div>
  );
}

export function SandboxHoldings({ holdings }: { holdings: PaperHolding[] }) {
  const sellHolding = useStore((st) => st.sellHolding);
  if (holdings.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="sandbox-holdings">
      <h3 className="text-sm font-medium uppercase tracking-wide text-heading">
        Shares held ({holdings.length})
      </h3>
      {holdings.map((h) => {
        const value = h.shares * (h.lastPrice ?? h.costBasis);
        const cost = h.shares * h.costBasis;
        const unrl = value - cost;
        return (
          <div key={h.symbol}
            className={cx("card-glass flex flex-wrap items-center gap-3 p-3",
              unrl > 0 ? "glow-pnl-win" : unrl < 0 ? "glow-pnl-loss" : "")}
            data-testid="holding-row">
            <span className="w-16 font-mono font-semibold">{h.symbol}</span>
            <span className="font-mono text-sm text-content-2">
              {h.shares} sh @ ${h.costBasis.toFixed(2)}
              {h.lastPrice != null && (
                <span className="text-content-3"> → ${h.lastPrice.toFixed(2)}</span>
              )}
            </span>
            <span className="text-xs text-content-3" title="Assigned from a cash-secured put">
              from {h.from}
            </span>
            <span className={cx("ml-auto font-mono font-bold tabular-nums",
              unrl > 0 ? "text-accent-green" : unrl < 0 ? "text-accent-red" : "text-content-2")}
              title="Unrealized share P&L at the latest quote">
              {unrl >= 0 ? "+" : ""}{money(unrl)}
            </span>
            <Button variant="secondary" size="xs" data-testid="holding-sell"
              onClick={() => sellHolding(h.symbol)}
              title="Sell all shares at the latest market price">
              Sell at market
            </Button>
          </div>
        );
      })}
    </div>
  );
}
