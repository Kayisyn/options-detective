import { useLayoutEffect, useRef, useState } from "react";
import { THEMES, useTheme } from "../../contexts/ThemeContext";
import { useMode } from "../../contexts/ModeContext";
import { useStore } from "../../store";
import {
  COMPONENT_KEYS, COMPONENT_META, DEFAULT_WEIGHTS, WEIGHT_PRESETS,
  normalizeWeights, weightsEqual, weightsSum,
} from "../../lib/scoring";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ViewTransition from "./ViewTransition";
import { cx } from "../../lib/cx";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

// Settings, v1.4.x: fixed header (title + close), tab strip with a sliding
// underline, scrollable body. Tab switches reuse the page-level
// ViewTransition (exit slide-left 200ms, enter slide-right 300ms) and the
// sections inside each tab stagger in 50ms apart. Selection applies
// instantly and persists.

type TabId = "appearance" | "customization" | "scoring" | "complexity";

const SETTINGS_TABS: Array<{ id: TabId; label: string }> = [
  { id: "appearance", label: "Appearance" },
  { id: "customization", label: "Customization" },
  { id: "scoring", label: "Scoring weights" },
  { id: "complexity", label: "Complexity" },
];

// staggered section reveal inside a freshly entered tab
function Section({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <div className="animate-card-enter" style={{ animationDelay: `${index * 50}ms` }}>
      {children}
    </div>
  );
}

function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  return (
    <Section index={0}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
    </Section>
  );
}

// A labelled on/off row for the Performance section.
function FxToggle({ label, desc, on, onToggle, testid }: {
  label: string; desc: string; on: boolean; onToggle: () => void; testid: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-content-3">{desc}</div>
      </div>
      <Button
        variant={on ? "secondary" : "ghost"} size="sm"
        data-testid={testid}
        onClick={onToggle}
      >
        {on ? "On" : "Off"}
      </Button>
    </div>
  );
}

// v1.5.0/v1.5.1: visual-effects controls (motion preference) + a Performance
// section whose four toggles let the user isolate a scroll-stutter culprit.
function CustomizationTab() {
  const fxParticles = useStore((s) => s.fxParticles);
  const fxParticleCount = useStore((s) => s.fxParticleCount);
  const fxMotion = useStore((s) => s.fxMotion);
  const fxParallax = useStore((s) => s.fxParallax);
  const fxLiquidGlass = useStore((s) => s.fxLiquidGlass);
  const fxGlow = useStore((s) => s.fxGlow);
  const setFx = useStore((s) => s.setFx);
  const osReduced = typeof matchMedia !== "undefined"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <Section index={0}>
      <div className="mb-3 rounded-md bg-dark-700/50 p-4" data-testid="motion-settings">
        <div className="text-sm font-medium">Animations</div>
        <div className="mt-0.5 text-xs text-content-3">
          {osReduced
            ? "Your OS asks for reduced motion, so animations are off in “System” mode. Pick “Always on” to see the app’s transitions, glow and shimmer anyway."
            : "Follow the OS setting, or force animations on or off for this app."}
        </div>
        <div className="mt-3 flex gap-1.5">
          {([
            { id: "system", label: "System" },
            { id: "on", label: "Always on" },
            { id: "off", label: "Off" },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              data-motion-pref={opt.id}
              onClick={() => setFx({ motion: opt.id })}
              className={cx(
                "rounded border px-2.5 py-1.5 text-xs transition-all duration-150 ease-out-quad",
                fxMotion === opt.id
                  ? "border-accent-primary/60 bg-accent-primary/15 text-accent-primary-text"
                  : "border-dark-600 text-content-3 hover:border-dark-500 hover:text-content-2",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-md bg-dark-700/50 p-4" data-testid="fx-settings">
        <div className="text-sm font-medium">Performance</div>
        <div className="mt-0.5 text-xs text-content-3">
          If scrolling feels sluggish, toggle these off to find the culprit.
          All default on — turning one off only affects visuals, never data.
        </div>

        <div className="mt-2 divide-y divide-white/5">
          <FxToggle
            label="Particle background"
            desc="Cursor-reactive drifting particles behind the app."
            on={fxParticles} testid="fx-particles-toggle"
            onToggle={() => setFx({ particles: !fxParticles })}
          />
          {fxParticles && (
            <label className="flex items-center gap-3 py-2.5 text-sm">
              <span className="w-32 shrink-0 text-content-2">Particle count</span>
              <input
                type="range" min={50} max={300} step={10}
                value={fxParticleCount}
                onChange={(e) => setFx({ particleCount: Number(e.target.value) })}
                data-testid="fx-particle-count"
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-dark-600"
                style={{ accentColor: "rgb(var(--od-accent-primary))" }}
              />
              <span className="w-10 text-right font-mono text-xs text-content-2">
                {fxParticleCount}
              </span>
            </label>
          )}
          <FxToggle
            label="Parallax effect"
            desc="Background depth shift as the cursor moves. Independent of particles."
            on={fxParallax} testid="fx-parallax-toggle"
            onToggle={() => setFx({ parallax: !fxParallax })}
          />
          <FxToggle
            label="Liquid glass"
            desc="Flowing shimmer on cards, buttons, inputs and modals."
            on={fxLiquidGlass} testid="fx-liquid-toggle"
            onToggle={() => setFx({ liquidGlass: !fxLiquidGlass })}
          />
          <FxToggle
            label="Glow effects"
            desc="Neon halo on CTAs, green/red P&L glow, and focus glow."
            on={fxGlow} testid="fx-glow-toggle"
            onToggle={() => setFx({ glow: !fxGlow })}
          />
        </div>
      </div>
    </Section>
  );
}

function ScoringTab() {
  const weights = useStore((s) => s.weights);
  const setWeights = useStore((s) => s.setWeights);
  const profiles = useStore((s) => s.weightProfiles);
  const saveWeightProfile = useStore((s) => s.saveWeightProfile);
  const deleteWeightProfile = useStore((s) => s.deleteWeightProfile);
  const [profileName, setProfileName] = useState("");

  const sum = weightsSum(weights);
  const sumOk = Math.abs(sum - 1) < 0.001;

  return (
    <Section index={0}>
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
              Changes apply instantly to the current screen and to Optimal
              Strategies — no re-screening needed.
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
    </Section>
  );
}

function ComplexityTab() {
  const { expertMode, toggleMode } = useMode();
  return (
    <Section index={0}>
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
    </Section>
  );
}

export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const showToast = useStore((s) => s.showToast);
  const [tab, setTab] = useState<TabId>("appearance");
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const [underline, setUnderline] = useState({ x: 0, w: 0 });

  // slide the active-tab underline: translateX to the tab, scaleX to its
  // width (the bar is 1px wide, so scaleX == px width — GPU-only)
  useLayoutEffect(() => {
    if (!open) return;
    const el = tabRefs.current[tab];
    if (el) setUnderline({ x: el.offsetLeft, w: el.offsetWidth });
  }, [tab, open]);

  function close() {
    onClose();
    showToast("✓ Settings saved"); // §5.4 — settings apply instantly
  }

  return (
    <Modal open={open} onClose={close} testid="settings-panel" flush>
      {/* fixed header: title + close, then the tab strip */}
      <div className="shrink-0 border-b border-white/10 px-6 pt-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Settings</h2>
          <Button variant="ghost" size="xs" onClick={close} aria-label="Close settings">✕</Button>
        </div>
        <div className="relative flex gap-1" role="tablist" aria-label="Settings sections">
          {SETTINGS_TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => { tabRefs.current[t.id] = el; }}
              role="tab"
              aria-selected={tab === t.id}
              data-settings-tab={t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                "group relative rounded-t px-3 pb-2.5 pt-1 text-sm transition-all duration-150 ease-out-quad",
                tab === t.id
                  ? "text-content-1"
                  : "text-content-2 opacity-60 hover:scale-[1.02] hover:opacity-100",
              )}
            >
              {t.label}
              {/* hover preview of the active underline */}
              {tab !== t.id && (
                <span className="absolute inset-x-3 bottom-0 h-0.5 origin-left scale-x-0 bg-accent-primary/40 transition-transform duration-150 ease-out-quad group-hover:scale-x-100" />
              )}
            </button>
          ))}
          <span
            aria-hidden
            className="settings-tab-underline absolute bottom-0 left-0 h-0.5 w-px bg-accent-primary"
            style={{ transform: `translateX(${underline.x}px) scaleX(${underline.w})` }}
          />
        </div>
      </div>

      {/* scrollable body — the header above never moves */}
      <div className="settings-scroll min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <ViewTransition viewKey={tab}>
          {tab === "appearance" && <AppearanceTab />}
          {tab === "customization" && <CustomizationTab />}
          {tab === "scoring" && <ScoringTab />}
          {tab === "complexity" && <ComplexityTab />}
        </ViewTransition>
        <p className="mt-4 text-xs text-content-3">
          Settings apply instantly and persist on this machine.
        </p>
      </div>
    </Modal>
  );
}
