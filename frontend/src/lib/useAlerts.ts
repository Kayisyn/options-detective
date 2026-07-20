// v1.9.0: mounts the alert sweeps into MainApp. Cadence per spec — P&L
// every 60s, expiry hourly, strategy score every 5 minutes — plus an
// immediate sweep whenever the underlying data actually changes. Dedup
// lives in lib/alerts (fired-keys ledger), so eager sweeps are safe.
import { useEffect } from "react";
import { useStore } from "../store";
import {
  evaluateExpiry, evaluatePnl, evaluateScore, fireAlerts, loadAlertPrefs,
} from "./alerts";

export function useAlerts() {
  const savedTrades = useStore((s) => s.savedTrades);
  const etfResult = useStore((s) => s.etfResult);
  const showToast = useStore((s) => s.showToast);

  // interval sweeps (skip while the window is hidden, like the pulse poll)
  useEffect(() => {
    const sweepPnl = () => {
      const now = new Date();
      fireAlerts(evaluatePnl(useStore.getState().savedTrades, loadAlertPrefs(), now), showToast, now);
    };
    const sweepExpiry = () => {
      const now = new Date();
      fireAlerts(evaluateExpiry(useStore.getState().savedTrades, loadAlertPrefs(), now), showToast, now);
    };
    const sweepScore = () => {
      const now = new Date();
      const etfs = useStore.getState().etfResult?.candidates ?? [];
      fireAlerts(evaluateScore(etfs, loadAlertPrefs(), now), showToast, now);
    };
    const pnlTimer = setInterval(() => { if (!document.hidden) sweepPnl(); }, 60_000);
    const expiryTimer = setInterval(() => { if (!document.hidden) sweepExpiry(); }, 3_600_000);
    const scoreTimer = setInterval(() => { if (!document.hidden) sweepScore(); }, 300_000);
    return () => {
      clearInterval(pnlTimer);
      clearInterval(expiryTimer);
      clearInterval(scoreTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- timers mount once
  }, []);

  // data-change sweeps: closing a trade or refreshing the screener should
  // alert now, not at the next tick
  useEffect(() => {
    const now = new Date();
    const prefs = loadAlertPrefs();
    fireAlerts(
      [...evaluatePnl(savedTrades, prefs, now), ...evaluateExpiry(savedTrades, prefs, now)],
      showToast, now,
    );
  }, [savedTrades, showToast]);

  useEffect(() => {
    const now = new Date();
    fireAlerts(
      evaluateScore(etfResult?.candidates ?? [], loadAlertPrefs(), now),
      showToast, now,
    );
  }, [etfResult, showToast]);
}
