import { useState } from "react";
import { THEMES, useTheme } from "../../contexts/ThemeContext";
import { useMode } from "../../contexts/ModeContext";
import { useStore } from "../../store";
import {
  COMPONENT_KEYS, COMPONENT_META, DEFAULT_WEIGHTS, WEIGHT_PRESETS,
  normalizeWeights, weightsEqual, weightsSum,
} from "../../lib/scoring";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import { cx } from "../../lib/cx";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

// Appearance settings, v1.4.0: obsidian theme plus colorblind-safe
// variants, with live swatch previews; selection applies instantly and
// persists. Complexity mode lives here too, mirroring the header toggle.
export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { theme, setTheme } = useTheme();
  const { expertMode, toggleMode } = useMode();
  const showToast = useStore((s) => s.showToast);
  const weights = useStore((s) => s.weights);
  const setWeights = useStore((s) => s.setWeights);
  const profiles = useStore((s) => s.weightProfiles);
  const saveWeightProfile = useStore((s) => s.saveWeightProfile);
  const deleteWeightProfile = useStore((s) => s.deleteWeightProfile);
  const [profileName, setProfileName] = useState("");

  const sum = weightsSum(weights);
  const sumOk = Math.abs(sum - 1) < 0.001;

  function close() {
    onClose();
    showToast("✓ Settings saved"); // §5.4 — settings apply instantly
  }

  return (
    <Modal open={open} onClose={close} testid="settings-panel">
      <>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Settings</h2>
          <Button variant="ghost" size="xs" onClick={close}>✕</Button>
        </div>

        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-content-3">
          Appearance
        </h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              title={t.hint}
              data-theme-card={t.id}
              className={cx(
                "rounded-md border-2 p-2 text-left transition-all duration-150 ease-out-quad",
                theme === t.id
                  ? "border-accent-primary shadow-glow"
                  : "border-dark-600 hover:border-dark-500",
              )}
            >
              <div
                className="mb-2 flex h-12 items-end gap-1 rounded p-1.5"
                style={{ backgroundColor: t.swatch.bg }}
              >
                <div className="h-6 flex-1 rounded-sm" style={{ backgroundColor: t.swatch.panel }} />
                <div className="flex flex-col gap-1">
                  {t.swatch.accents.map((c) => (
                    <span key={c} className="h-2 w-2 rounded-full" style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div className="text-sm font-medium text-content-1">{t.name}</div>
              <div className="text-xs text-content-3">{t.hint}</div>
            </button>
          ))}
        </div>

        <h3 className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-content-3">
          Scoring weights
        </h3>
        <div className="rounded-md bg-dark-700/50 p-4" data-testid="scoring-settings">
          <details className="mb-3">
            <summary className="cursor-pointer text-sm text-content-2">
              How scoring works
            </summary>
            <div className="mt-2 space-y-2 text-xs text-content-3">
              <p className="font-mono text-content-2">
                score = 10 × (w<sub>pop</sub>·POP + w<sub>ror</sub>·RoR + w<sub>θ</sub>·Theta
                + w<sub>ce</sub>·CapEff + w<sub>liq</sub>·Liquidity)
              </p>
              <p>
                Each component is normalized to 0–1 by the backend engine; the
                sliders only change how the components are mixed. Example: raise
                POP to 0.5 and high-probability candidates jump up the ranking.
              </p>
              <ul className="space-y-1">
                {COMPONENT_KEYS.map((k) => (
                  <li key={k}>
                    <b className="text-content-2">{COMPONENT_META[k].label}:</b>{" "}
                    {COMPONENT_META[k].explain}
                  </li>
                ))}
              </ul>
              <p>
                Changes apply instantly to the current screen and to the
                Recommender — no re-screening needed.
              </p>
            </div>
          </details>

          <div className="mb-3 flex flex-wrap gap-1.5">
            {WEIGHT_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => setWeights({ ...p.weights })}
                title={p.hint}
                data-preset={p.id}
                className={cx(
                  "rounded border px-2 py-1 text-xs transition-all duration-150 ease-out-quad",
                  weightsEqual(weights, p.weights)
                    ? "border-accent-primary/60 bg-accent-primary/15 text-accent-primary-text"
                    : "border-dark-600 text-content-3 hover:border-dark-500 hover:text-content-2",
                )}
              >
                {p.name}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {COMPONENT_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-3 text-sm" title={COMPONENT_META[k].explain}>
                <span className="w-32 shrink-0 text-content-2">{COMPONENT_META[k].label}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={weights[k]}
                  onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })}
                  data-weight-slider={k}
                  className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-dark-600"
                  style={{ accentColor: "rgb(var(--od-accent-primary))" }}
                />
                <span className="w-10 text-right font-mono text-xs text-content-2">
                  {weights[k].toFixed(2)}
                </span>
              </label>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-2 text-xs" data-testid="weight-sum">
            <span className={sumOk ? "text-accent-green" : "text-accent-orange"}>
              Sum: {sum.toFixed(2)} {sumOk ? "✓" : "— should be 1.00"}
            </span>
            {!sumOk && (
              <Button variant="secondary" size="xs"
                onClick={() => setWeights(normalizeWeights(weights))}>
                Normalize
              </Button>
            )}
            {!weightsEqual(weights, DEFAULT_WEIGHTS) && (
              <Button variant="ghost" size="xs"
                onClick={() => setWeights({ ...DEFAULT_WEIGHTS })}>
                Reset to default
              </Button>
            )}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Profile name (e.g. My high-POP setup)"
              data-testid="profile-name"
              className="flex-1 rounded-sm border border-dark-600 bg-dark-800 px-2 py-1.5 text-xs text-content-1 placeholder:text-content-3 focus:border-accent-primary focus:outline-none"
            />
            <Button size="xs" disabled={profileName.trim() === ""}
              onClick={() => { saveWeightProfile(profileName); setProfileName(""); }}>
              Save profile
            </Button>
          </div>
          {profiles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5" data-testid="profile-list">
              {profiles.map((p) => (
                <span key={p.name}
                  className="inline-flex items-center gap-1 rounded border border-dark-600 px-2 py-1 text-xs text-content-2">
                  <button className="hover:text-accent-primary-text" title="Apply this profile"
                    onClick={() => setWeights({ ...p.weights })}>
                    {p.name}
                  </button>
                  <button className="text-content-3 hover:text-accent-red" title="Delete profile"
                    onClick={() => deleteWeightProfile(p.name)}>
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <h3 className="mb-2 mt-6 text-xs font-medium uppercase tracking-wide text-content-3">
          Complexity
        </h3>
        <div className="flex items-center justify-between rounded-md bg-dark-700/50 px-4 py-3">
          <div>
            <div className="text-sm font-medium">
              {expertMode ? "Expert mode" : "Beginner mode"}
            </div>
            <div className="text-xs text-content-3">
              {expertMode
                ? "All greeks, scores and metrics visible"
                : "Simplified view — plain-language explanations, greeks tucked away"}
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={toggleMode}>
            Switch to {expertMode ? "Beginner" : "Expert"}
          </Button>
        </div>

        <p className="mt-4 text-xs text-content-3">
          Settings apply instantly and persist on this machine.
        </p>
      </>
    </Modal>
  );
}
