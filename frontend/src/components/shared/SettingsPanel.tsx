import { useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../../store";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import ViewTransition from "./ViewTransition";
import { cx } from "../../lib/cx";
// v1.10.1: the tab components live in SettingsTabs.tsx; this file is the shell
import {
  AppearanceTab, CustomizationTab, SidebarTab, CurrencyTab, ScoringTab,
  ComplexityTab, TemplatesTab, AlertsTab, AccountTab,
} from "./SettingsTabs";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  /** v1.9.1: jump straight to a tab when opened (⋮ menu → Account) */
  openTab?: TabId | null;
}

// Settings, v1.4.x: fixed header (title + close), tab strip with a sliding
// underline, scrollable body. Tab switches reuse the page-level
// ViewTransition (exit slide-left 200ms, enter slide-right 300ms) and the
// sections inside each tab stagger in 50ms apart. Selection applies
// instantly and persists.

export type TabId = "appearance" | "customization" | "sidebar" | "currency" | "scoring" | "complexity" | "templates" | "alerts" | "account";

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

export default function SettingsPanel({ open, onClose, openTab }: SettingsPanelProps) {
  const showToast = useStore((s) => s.showToast);
  const [tab, setTab] = useState<TabId>("appearance");

  // ⋮ menu deep-link: land on the requested tab each time it opens with one
  useLayoutEffect(() => {
    if (open && openTab) setTab(openTab);
  }, [open, openTab]);
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
