import { THEMES, useTheme } from "../../contexts/ThemeContext";
import { useMode } from "../../contexts/ModeContext";
import Button from "../ui/Button";
import { cx } from "../../lib/cx";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

// Appearance settings (updated brief §4.2): six theme cards with live
// swatch previews; selection applies instantly and persists. Complexity
// mode lives here too, mirroring the header toggle.
export default function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { theme, setTheme } = useTheme();
  const { expertMode, toggleMode } = useMode();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      onClick={onClose}
      data-testid="settings-panel"
    >
      <div
        className="w-full max-w-xl rounded-lg border border-dark-600 bg-dark-800 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Settings</h2>
          <Button variant="ghost" size="xs" onClick={onClose}>✕</Button>
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
                "rounded-md border-2 p-2 text-left transition-all duration-150 ease-out",
                theme === t.id
                  ? "border-accent-blue shadow-glow"
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
          Shortcut: <span className="font-mono">Ctrl+Shift+D</span> flips dark/light.
          Settings apply instantly and persist on this machine.
        </p>
      </div>
    </div>
  );
}
