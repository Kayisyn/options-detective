import { useLayoutEffect, useRef, useState } from "react";
import { THEMES, useTheme } from "../../contexts/ThemeContext";
import { useMode } from "../../contexts/ModeContext";
import { useStore, type SidebarSection } from "../../store";
import {
  COMPONENT_KEYS, COMPONENT_META, DEFAULT_WEIGHTS, WEIGHT_PRESETS,
  normalizeWeights, weightsEqual, weightsSum,
} from "../../lib/scoring";
import { strategyLabel } from "../../lib/format";
import { api, type AccountBackup } from "../../lib/api";
import {
  deleteTemplate, downloadTemplates, duplicateTemplate, importTemplates,
  listTemplates, updateTemplate, type StrategyTemplate,
} from "../../lib/templates";
import {
  clearAlertHistory, loadAlertHistory, loadAlertPrefs, notifyPermission,
  requestNotifyPermission, saveAlertPrefs, type AlertPrefs,
} from "../../lib/alerts";
import Button from "../ui/Button";
import { FormInput } from "../ui/Input";
import Modal from "../ui/Modal";
import ViewTransition from "./ViewTransition";
import { SECTION_LABELS } from "./Sidebars";
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

type TabId = "appearance" | "customization" | "sidebar" | "currency" | "scoring" | "complexity" | "templates" | "alerts" | "account";

const SETTINGS_TABS: Array<{ id: TabId; label: string }> = [
  { id: "appearance", label: "Appearance" },
  { id: "customization", label: "Customization" },
  { id: "sidebar", label: "Sidebar" },
  { id: "currency", label: "Currency" },
  { id: "scoring", label: "Scoring" },
  { id: "complexity", label: "Complexity" },
  { id: "templates", label: "Templates" },
  { id: "alerts", label: "Alerts" },
  { id: "account", label: "Account" },
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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

// v1.5.1 Sidebar customization: reorder the right-sidebar sections. Native
// drag-and-drop for mouse; ▲/▼ buttons are the keyboard-accessible path.
function useSectionPreview(): (section: SidebarSection) => string[] {
  const watchlist = useStore((s) => s.etfWatchlist);
  const trades = useStore((s) => s.savedTrades);
  const pulse = useStore((s) => s.pulse);
  return (section) => {
    switch (section) {
      case "watchlist":
        return watchlist.length ? watchlist.slice(0, 2) : ["No ETFs starred yet"];
      case "recentTrades": {
        const closed = trades
          .filter((t) => t.status === "closed" && !t.archived)
          .sort((a, b) => (b.closedAt ?? "").localeCompare(a.closedAt ?? ""));
        return closed.length
          ? closed.slice(0, 2).map((t) => `${t.symbol} ${strategyLabel(t.strategy)}`)
          : ["No closed positions yet"];
      }
      case "breadth":
        return pulse?.breadth
          ? [`Score ${pulse.breadth.score} / 100`,
             `${pulse.breadth.advancers} up · ${pulse.breadth.decliners} down`]
          : ["Waiting for market data…"];
      case "trending":
        return pulse
          ? pulse.trending.gainers.slice(0, 2).map(
              (r) => `${r.symbol} ${r.changePct > 0 ? "+" : ""}${r.changePct.toFixed(1)}%`)
          : ["Waiting for market data…"];
      case "news":
        return pulse && pulse.news.length
          ? pulse.news.slice(0, 2).map((n) => n.title)
          : ["No headlines yet"];
    }
  };
}

function SidebarTab() {
  const order = useStore((s) => s.sidebarOrder);
  const setSidebarOrder = useStore((s) => s.setSidebarOrder);
  const resetSidebarOrder = useStore((s) => s.resetSidebarOrder);
  const preview = useSectionPreview();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const isDefault = order.join() === ["watchlist", "recentTrades", "breadth", "trending", "news"].join();

  function move(from: number, to: number) {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setSidebarOrder(next);
  }

  return (
    <Section index={0}>
      <p className="mb-3 text-xs text-content-3">
        Drag the sections to reorder the right sidebar, or use the ▲▼ buttons.
        The order applies live and persists on this machine.
      </p>
      <ul className="space-y-2" data-testid="sidebar-reorder">
        {order.map((section, i) => (
          <li
            key={section}
            draggable
            data-sidebar-section={section}
            onDragStart={() => setDragIndex(i)}
            onDragEnd={() => setDragIndex(null)}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== i) {
                move(dragIndex, i);
                setDragIndex(i);
              }
            }}
            className={cx(
              "flex items-center gap-3 rounded-md border border-dark-600 bg-dark-700/50 p-2.5",
              "transition-transform duration-150 ease-out-quad",
              dragIndex === i ? "scale-[1.02] border-accent-primary/60 shadow-glow" : "hover:border-dark-500",
            )}
          >
            <span aria-hidden className="cursor-grab select-none text-content-3" title="Drag to reorder">⋮⋮</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-content-1">{SECTION_LABELS[section]}</div>
              <div className="truncate text-[11px] text-content-3">
                {preview(section).join(" · ")}
              </div>
            </div>
            <div className="flex shrink-0 flex-col">
              <button
                onClick={() => move(i, i - 1)} disabled={i === 0}
                aria-label={`Move ${SECTION_LABELS[section]} up`}
                data-testid="sidebar-move-up"
                className="px-1 text-xs text-content-3 transition-colors hover:text-content-1 disabled:opacity-30"
              >▲</button>
              <button
                onClick={() => move(i, i + 1)} disabled={i === order.length - 1}
                aria-label={`Move ${SECTION_LABELS[section]} down`}
                data-testid="sidebar-move-down"
                className="px-1 text-xs text-content-3 transition-colors hover:text-content-1 disabled:opacity-30"
              >▼</button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <Button variant="ghost" size="xs" disabled={isDefault}
          data-testid="sidebar-reset" onClick={resetSidebarOrder}>
          Reset to default
        </Button>
      </div>
    </Section>
  );
}

// v1.7.0 currency: USD / CAD / dual display + exchange-rate management.
// Market data and stored values stay USD; CAD is a display conversion —
// realized trades convert at their stamped historical rate.
function CurrencyTab() {
  const mode = useStore((s) => s.currencyMode);
  const autoUpdate = useStore((s) => s.fxAutoUpdate);
  const rate = useStore((s) => s.fxRate);
  const asOf = useStore((s) => s.fxAsOf);
  const stale = useStore((s) => s.fxStale);
  const busy = useStore((s) => s.fxBusy);
  const setCurrency = useStore((s) => s.setCurrency);
  const loadFx = useStore((s) => s.loadFx);
  const showToast = useStore((s) => s.showToast);

  const MODES = [
    { id: "usd", label: "USD only", hint: "Default — everything in US dollars" },
    { id: "cad", label: "CAD only", hint: "Converted at the exchange rate" },
    { id: "dual", label: "Dual", hint: "US$ | C$ side by side" },
  ] as const;

  return (
    <Section index={0}>
      <div className="mb-3 rounded-md bg-dark-700/50 p-4" data-testid="currency-settings">
        <div className="text-sm font-medium">Display currency</div>
        <div className="mt-0.5 text-xs text-content-3">
          Applies to P&amp;L, account values and stats. Quotes, strikes and
          per-share prices stay in USD (their market currency). Closed trades
          convert at the rate stamped when they closed; ≈ marks older trades
          converted at today's rate.
        </div>
        <div className="mt-3 flex gap-1.5">
          {MODES.map((m) => (
            <button key={m.id} title={m.hint} data-currency-mode={m.id}
              onClick={() => setCurrency({ mode: m.id })}
              className={cx(
                "rounded border px-2.5 py-1.5 text-xs transition-all duration-150 ease-out-quad",
                mode === m.id
                  ? "border-accent-primary/60 bg-accent-primary/15 text-accent-primary-text"
                  : "border-dark-600 text-content-3 hover:border-dark-500 hover:text-content-2",
              )}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-md bg-dark-700/50 p-4" data-testid="fx-rate-settings">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-medium">Exchange rate</div>
            <div className="mt-0.5 font-mono text-sm text-content-2" data-testid="fx-rate-line">
              {rate == null ? "No rate fetched yet" : `1 USD = ${rate.toFixed(4)} CAD`}
              {stale && rate != null && (
                <span className="ml-2 text-xs text-accent-orange"
                  title="Not from a fresh fetch — last saved rate or the built-in fallback">
                  stale
                </span>
              )}
            </div>
            <div className="text-xs text-content-3">
              {asOf ? `Last update: ${asOf.slice(0, 16).replace("T", " ")} UTC` : "Source: Yahoo (CAD=X), refreshed daily"}
            </div>
          </div>
          <Button variant="secondary" size="sm" disabled={busy}
            data-testid="fx-refresh"
            onClick={async () => {
              await loadFx(true);
              const r = useStore.getState().fxRate;
              showToast(r == null ? "Rate refresh failed" : `✓ 1 USD = ${r.toFixed(4)} CAD`);
            }}>
            {busy ? "Refreshing…" : "Refresh now"}
          </Button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-content-2">
          <input type="checkbox" checked={autoUpdate}
            onChange={(e) => setCurrency({ autoUpdate: e.target.checked })}
            data-testid="fx-auto-update"
            className="accent-accent-primary" />
          Refresh automatically (daily)
        </label>
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

// v1.8.1 Templates tab: manage the Asset Screener's saved filter templates
// (create happens in the screener via "Save as Template").
function TemplatesTab() {
  const account = useStore((s) => s.account);
  const showToast = useStore((s) => s.showToast);
  const username = account?.username ?? "default";
  const [templates, setTemplates] = useState<StrategyTemplate[]>(() => listTemplates(username));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = () => setTemplates(listTemplates(username));

  function startEdit(t: StrategyTemplate) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditDesc(t.description);
  }

  function saveEdit() {
    if (!editingId) return;
    updateTemplate(username, editingId, { name: editName, description: editDesc });
    setEditingId(null);
    refresh();
  }

  function onImportFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const added = importTemplates(username, String(reader.result));
        refresh();
        showToast(`✓ Imported ${added} ${added === 1 ? "template" : "templates"}`);
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Template import failed");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-4" data-testid="templates-tab">
      <Section index={0}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-content-3">
            Saved Asset Screener filter sets. Create one from the screener via
            <b className="text-content-2"> Save as Template</b>.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="xs" disabled={templates.length === 0}
              onClick={() => downloadTemplates(username)} data-testid="templates-export">
              Export file
            </Button>
            <Button variant="ghost" size="xs" onClick={() => fileRef.current?.click()}
              data-testid="templates-import">
              Import file
            </Button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
              onChange={(e) => { onImportFile(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        </div>
      </Section>
      <Section index={1}>
        {templates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-dark-600 p-4 text-center text-sm text-content-3">
            No templates yet.
          </p>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.id} className="rounded-lg bg-dark-700/50 p-3" data-template-id={t.id}>
                {editingId === t.id ? (
                  <div className="space-y-2">
                    <FormInput label="Name" value={editName}
                      onChange={(e) => setEditName(e.target.value)} />
                    <FormInput label="Description" value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)} />
                    <div className="flex gap-2">
                      <Button size="xs" onClick={saveEdit} disabled={!editName.trim()}>Save</Button>
                      <Button variant="ghost" size="xs" onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-content-1">{t.name}</div>
                      {t.description && (
                        <div className="text-xs text-content-3">{t.description}</div>
                      )}
                      <div className="mt-0.5 text-[11px] text-content-3">
                        {strategyLabel(t.strategy)} · saved {t.createdAt.slice(0, 10)} · used{" "}
                        {t.usageCount ?? 0}×
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button variant="ghost" size="xs" onClick={() => startEdit(t)}>Edit</Button>
                      <Button variant="ghost" size="xs"
                        onClick={() => { duplicateTemplate(username, t.id); refresh(); }}>
                        Duplicate
                      </Button>
                      <Button variant="ghost" size="xs" className="text-accent-red hover:bg-accent-red/10"
                        onClick={() => { deleteTemplate(username, t.id); refresh(); }}>
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// v1.9.0 Alerts tab: toggles + thresholds for the three alert types,
// desktop-notification permission, and the 50-entry alert history.
function AlertCheck({ checked, onChange, children, testid }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
  testid?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 py-1 text-sm text-content-2 hover:text-content-1">
      <input type="checkbox" checked={checked} data-testid={testid}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[rgb(var(--od-accent-primary))]" />
      {children}
    </label>
  );
}

function AlertsTab() {
  const [prefs, setPrefs] = useState<AlertPrefs>(loadAlertPrefs);
  const [perm, setPerm] = useState(notifyPermission());
  const [history, setHistory] = useState(loadAlertHistory);
  const [showHistory, setShowHistory] = useState(false);

  function update(patch: Partial<AlertPrefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveAlertPrefs(next);
  }

  const numField = (label: string, key: "pnlUp" | "pnlDown" | "scoreIvRank", prefix = "$") => (
    <label className="flex items-center gap-2 text-sm text-content-2">
      {label}
      <span className="flex items-center gap-1">
        <span className="text-content-3">{prefix}</span>
        <input type="number" min={0} value={prefs[key]}
          data-testid={`alert-${key}`}
          onChange={(e) => update({ [key]: Math.max(0, Number(e.target.value) || 0) } as Partial<AlertPrefs>)}
          className="w-24 rounded-md border border-white/10 bg-dark-800 px-2 py-1 text-sm text-content-1 focus:border-accent-primary focus:outline-none" />
      </span>
    </label>
  );

  return (
    <div className="space-y-5" data-testid="alerts-tab">
      <Section index={0}>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-heading">Desktop notifications</h3>
        {perm === "granted" ? (
          <p className="text-sm text-accent-green" data-testid="notify-status">
            ✓ Enabled — alerts appear as OS notifications.
          </p>
        ) : perm === "unsupported" ? (
          <p className="text-sm text-content-3" data-testid="notify-status">
            Not available here — alerts fall back to in-app toasts.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-content-3" data-testid="notify-status">
              {perm === "denied"
                ? "Blocked by the system — alerts fall back to in-app toasts."
                : "Alerts currently show as in-app toasts."}
            </p>
            {perm === "default" && (
              <Button size="xs" variant="secondary" data-testid="notify-enable"
                onClick={async () => setPerm(await requestNotifyPermission())}>
                Enable desktop notifications
              </Button>
            )}
          </div>
        )}
      </Section>

      <Section index={1}>
        <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-heading">P&L threshold</h3>
        <AlertCheck checked={prefs.pnlEnabled} testid="alert-pnl-enabled"
          onChange={(v) => update({ pnlEnabled: v })}>
          Alert on today&apos;s realized P&L
        </AlertCheck>
        {prefs.pnlEnabled && (
          <div className="ml-6 flex flex-wrap gap-4 pt-1">
            {numField("Gain reaches +", "pnlUp")}
            {numField("Loss reaches −", "pnlDown")}
          </div>
        )}
      </Section>

      <Section index={2}>
        <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-heading">Position expiry</h3>
        <AlertCheck checked={prefs.expiryEnabled} testid="alert-expiry-enabled"
          onChange={(v) => update({ expiryEnabled: v })}>
          Alert on upcoming expirations
        </AlertCheck>
        {prefs.expiryEnabled && (
          <div className="ml-6 pt-1">
            <AlertCheck checked={prefs.expiry7d} onChange={(v) => update({ expiry7d: v })}>
              Within 7 days of expiration
            </AlertCheck>
            <AlertCheck checked={prefs.expiryDay} onChange={(v) => update({ expiryDay: v })}>
              On expiration day
            </AlertCheck>
          </div>
        )}
      </Section>

      <Section index={3}>
        <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-heading">Strategy score</h3>
        <AlertCheck checked={prefs.scoreEnabled} testid="alert-score-enabled"
          onChange={(v) => update({ scoreEnabled: v })}>
          Alert when the Asset Screener holds a high IV rank
        </AlertCheck>
        {prefs.scoreEnabled && (
          <div className="ml-6 pt-1">
            {numField("IV rank at least", "scoreIvRank", "")}
          </div>
        )}
      </Section>

      <Section index={4}>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wide text-heading">
            History{history.length > 0 ? ` (${history.length})` : ""}
          </h3>
          <div className="flex gap-2">
            <Button variant="ghost" size="xs" onClick={() => setShowHistory((v) => !v)}
              disabled={history.length === 0} data-testid="alert-history-toggle">
              {showHistory ? "Hide" : "Show"}
            </Button>
            <Button variant="ghost" size="xs" disabled={history.length === 0}
              onClick={() => { clearAlertHistory(); setHistory([]); }}>
              Clear
            </Button>
          </div>
        </div>
        {showHistory && history.length > 0 && (
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto" data-testid="alert-history">
            {history.map((h) => (
              <div key={h.key + h.at} className="rounded-md bg-dark-700/50 px-3 py-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-content-1">{h.title}</span>
                  <span className="shrink-0 text-content-3">{h.at.slice(0, 16).replace("T", " ")}</span>
                </div>
                <div className="text-content-3">{h.body}</div>
              </div>
            ))}
          </div>
        )}
        {history.length === 0 && (
          <p className="mt-1 text-xs text-content-3">No alerts fired yet.</p>
        )}
      </Section>
    </div>
  );
}

// v1.7.2 Account tab: profile facts, password change, backup/restore and
// the two destructive actions (clear data, delete account). Destructive
// flows confirm inline — no nested modals inside Settings.

const PW_RULES: Array<[string, (pw: string) => boolean]> = [
  ["8+ characters", (pw) => pw.length >= 8],
  ["a lowercase letter", (pw) => /[a-z]/.test(pw)],
  ["an uppercase letter", (pw) => /[A-Z]/.test(pw)],
  ["a number", (pw) => /[0-9]/.test(pw)],
];

// every persisted preference rides an od-prefixed localStorage key
function snapshotPrefs(): Record<string, string> {
  const prefs: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && (key.startsWith("od.") || key.startsWith("od-"))) {
        prefs[key] = localStorage.getItem(key) ?? "";
      }
    }
  } catch {
    // private mode: back up server data only
  }
  return prefs;
}

function restorePrefs(prefs: Record<string, string> | undefined) {
  if (!prefs) return;
  try {
    for (const [key, value] of Object.entries(prefs)) {
      if (key.startsWith("od.") || key.startsWith("od-")) localStorage.setItem(key, value);
    }
  } catch {
    // private mode: data restored, prefs stay as-is
  }
}

function AccountTab() {
  const account = useStore((s) => s.account);
  const logout = useStore((s) => s.logout);
  const bootAuth = useStore((s) => s.bootAuth);
  const showToast = useStore((s) => s.showToast);

  // security
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  // data management
  const [pendingImport, setPendingImport] = useState<AccountBackup | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // account actions
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!account) return null;
  const created = account.createdAt.slice(0, 10);
  const lastLogin = account.lastLoginAt ? account.lastLoginAt.slice(0, 10) : "—";
  const memberDays = Math.max(0, Math.floor((Date.now() - Date.parse(account.createdAt)) / 86_400_000));

  async function onChangePassword() {
    setPwError(null);
    if (newPw !== confirmPw) {
      setPwError("New passwords don't match");
      return;
    }
    if (PW_RULES.some(([, ok]) => !ok(newPw))) {
      setPwError("New password doesn't meet the requirements below");
      return;
    }
    setPwBusy(true);
    try {
      await api.authChangePassword({ currentPassword: currentPw, newPassword: newPw });
      setPwDone(true);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      // spec: announce, then end the session so the new password is exercised
      setTimeout(() => logout(), 10_000);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Password change failed");
    } finally {
      setPwBusy(false);
    }
  }

  async function onExport() {
    setBusy(true);
    try {
      const backup = await api.accountExport();
      backup.prefs = snapshotPrefs();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `option-obelisk-backup-${account?.username}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("✓ Backup downloaded");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  function onPickImport(file: File | undefined) {
    setImportError(null);
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as AccountBackup;
        if (parsed.app !== "option-obelisk" || typeof parsed.format !== "number") {
          throw new Error("That file isn't an Option Obelisk backup");
        }
        setPendingImport(parsed);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : "Unreadable backup file");
      }
    };
    reader.onerror = () => setImportError("Could not read that file");
    reader.readAsText(file);
  }

  async function onConfirmImport() {
    if (!pendingImport) return;
    setBusy(true);
    try {
      await api.accountImport(pendingImport);
      restorePrefs(pendingImport.prefs);
      showToast("✓ Data imported — reloading…");
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
      setPendingImport(null);
      setBusy(false);
    }
  }

  async function onConfirmClear() {
    setBusy(true);
    try {
      await api.accountClear();
      showToast("✓ All data cleared — reloading…");
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Clear failed");
      setBusy(false);
      setConfirmClear(false);
    }
  }

  async function onConfirmDelete() {
    setDeleteError(null);
    setBusy(true);
    try {
      await api.authDeleteAccount({ password: deletePw });
      // the account is gone server-side; logout() clears the per-account
      // slices, then bootAuth() refetches the (now shorter) account list so
      // the sign-in gate doesn't offer a chip for the deleted account
      await logout();
      await bootAuth();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="account-tab">
      <Section index={0}>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-heading">Profile</h3>
        <div className="rounded-lg bg-dark-700/50 p-3 text-sm">
          <div className="flex justify-between py-1">
            <span className="text-content-3">Username</span>
            <span className="font-medium text-content-1" data-testid="account-username">{account.username}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-content-3">Account created</span>
            <span className="text-content-2">{created} ({memberDays} {memberDays === 1 ? "day" : "days"} ago)</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-content-3">Last sign-in</span>
            <span className="text-content-2">{lastLogin}</span>
          </div>
        </div>
      </Section>

      <Section index={1}>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-heading">Security</h3>
        {pwDone ? (
          <div className="rounded-lg border border-accent-green/40 bg-accent-green/10 p-3 text-sm text-accent-green" data-testid="password-updated">
            Password updated. You&apos;ll be signed out in 10 seconds — sign back
            in with the new password.
          </div>
        ) : (
          <div className="space-y-2">
            <FormInput label="Current password" type="password" value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)} data-testid="pw-current" />
            <FormInput label="New password" type="password" value={newPw}
              onChange={(e) => setNewPw(e.target.value)} data-testid="pw-new" />
            <FormInput label="Confirm new password" type="password" value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)} data-testid="pw-confirm"
              error={pwError ?? undefined} />
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {PW_RULES.map(([label, ok]) => (
                <li key={label} className={ok(newPw) ? "text-accent-green" : "text-content-3"}>
                  {ok(newPw) ? "✓" : "·"} {label}
                </li>
              ))}
            </ul>
            <Button size="sm" onClick={onChangePassword} data-testid="pw-submit"
              disabled={pwBusy || !currentPw || !newPw || !confirmPw}>
              {pwBusy ? "Updating…" : "Update password"}
            </Button>
          </div>
        )}
      </Section>

      <Section index={2}>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-heading">Data management</h3>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={onExport} disabled={busy} data-testid="export-data">
            Export All Data
          </Button>
          <Button variant="secondary" size="sm" disabled={busy} data-testid="import-data"
            onClick={() => fileRef.current?.click()}>
            Import Data
          </Button>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden"
            data-testid="import-file"
            onChange={(e) => { onPickImport(e.target.files?.[0]); e.target.value = ""; }} />
          <Button variant="ghost" size="sm" disabled={busy} data-testid="clear-data"
            className="text-accent-red hover:bg-accent-red/10"
            onClick={() => setConfirmClear(true)}>
            Clear All Data
          </Button>
        </div>
        <p className="mt-2 text-xs text-content-3">
          The backup JSON holds your positions, sandbox account, asset
          watchlist and preferences. Importing overwrites current data.
        </p>
        {importError && (
          <p className="mt-2 text-xs text-accent-red" data-testid="import-error">{importError}</p>
        )}
        {pendingImport && (
          <div className="mt-2 rounded-lg border border-accent-orange/40 bg-accent-orange/10 p-3 text-sm" data-testid="import-confirm">
            <p className="text-content-1">
              This will overwrite existing data with the backup
              {pendingImport.exportedAt ? ` from ${pendingImport.exportedAt.slice(0, 10)}` : ""}. Continue?
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="xs" onClick={onConfirmImport} disabled={busy} data-testid="import-confirm-yes">
                {busy ? "Importing…" : "Import and overwrite"}
              </Button>
              <Button variant="ghost" size="xs" onClick={() => setPendingImport(null)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {confirmClear && (
          <div className="mt-2 rounded-lg border border-accent-red/40 bg-accent-red/10 p-3 text-sm" data-testid="clear-confirm">
            <p className="text-content-1">
              This cannot be undone. Delete all positions, sandbox history and
              watchlist data for <b>{account.username}</b>?
            </p>
            <div className="mt-2 flex gap-2">
              <Button variant="destructive" size="xs" onClick={onConfirmClear} disabled={busy} data-testid="clear-confirm-yes">
                {busy ? "Clearing…" : "Delete everything"}
              </Button>
              <Button variant="ghost" size="xs" onClick={() => setConfirmClear(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section index={3}>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-heading">Account actions</h3>
        {!confirmDelete ? (
          <Button variant="ghost" size="sm" data-testid="delete-account"
            className="text-accent-red hover:bg-accent-red/10"
            onClick={() => setConfirmDelete(true)}>
            Delete Account
          </Button>
        ) : (
          <div className="rounded-lg border border-accent-red/40 bg-accent-red/10 p-3 text-sm" data-testid="delete-confirm">
            <p className="font-medium text-content-1">Permanently delete this account?</p>
            <p className="mt-1 text-content-2">
              All positions, trades and settings for <b>{account.username}</b> will
              be erased. This cannot be undone. Enter your password to confirm.
            </p>
            <FormInput label="Password" type="password" value={deletePw}
              onChange={(e) => setDeletePw(e.target.value)} data-testid="delete-password"
              error={deleteError ?? undefined} containerClassName="mt-2" />
            <div className="mt-2 flex gap-2">
              <Button variant="destructive" size="xs" onClick={onConfirmDelete}
                disabled={busy || !deletePw} data-testid="delete-confirm-yes">
                {busy ? "Deleting…" : "Delete Account"}
              </Button>
              <Button variant="ghost" size="xs" disabled={busy}
                onClick={() => { setConfirmDelete(false); setDeletePw(""); setDeleteError(null); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Section>
    </div>
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
    <Modal open={open} onClose={close} testid="settings-panel" flush maxWidth="max-w-2xl">
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
          {tab === "sidebar" && <SidebarTab />}
          {tab === "currency" && <CurrencyTab />}
          {tab === "scoring" && <ScoringTab />}
          {tab === "complexity" && <ComplexityTab />}
          {tab === "templates" && <TemplatesTab />}
          {tab === "alerts" && <AlertsTab />}
          {tab === "account" && <AccountTab />}
        </ViewTransition>
        <p className="mt-4 flex items-baseline justify-between text-xs text-content-3">
          <span>Settings apply instantly and persist on this machine.</span>
          <span data-testid="app-version">Option Obelisk v{__APP_VERSION__}</span>
        </p>
      </div>
    </Modal>
  );
}
