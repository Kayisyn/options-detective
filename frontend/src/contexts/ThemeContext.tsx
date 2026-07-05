import {
  createContext, useCallback, useContext, useEffect, useState,
  type ReactNode,
} from "react";

// Six selectable themes (updated brief §4.2). The theme is a class on
// <html>; every component reads CSS variables, so switching is instant and
// touches no component code. Swatches below are only for the settings-panel
// preview cards.

export type ThemeId =
  | "dark" | "light" | "neon" | "professional" | "deuteranopia" | "protanopia";

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  hint: string;
  swatch: { bg: string; panel: string; accents: [string, string, string] };
}

export const THEMES: ThemeMeta[] = [
  {
    id: "dark", name: "Dark", hint: "Default — dark-room trading",
    swatch: { bg: "#0a0e27", panel: "#1a1f3a", accents: ["#3b82f6", "#10b981", "#ef4444"] },
  },
  {
    id: "light", name: "Light", hint: "Bright office, accessibility",
    swatch: { bg: "#f9fafb", panel: "#f3f4f6", accents: ["#1e40af", "#047857", "#991b1b"] },
  },
  {
    id: "neon", name: "Neon", hint: "High energy — cyan & magenta",
    swatch: { bg: "#0a0e27", panel: "#1a1f3a", accents: ["#06b6d4", "#10b981", "#d946ef"] },
  },
  {
    id: "professional", name: "Professional", hint: "Muted, corporate",
    swatch: { bg: "#1f2937", panel: "#374151", accents: ["#2563eb", "#059669", "#dc2626"] },
  },
  {
    id: "deuteranopia", name: "Colorblind (red-safe)", hint: "Profit = blue, loss = yellow",
    swatch: { bg: "#0a0e27", panel: "#1a1f3a", accents: ["#22d3ee", "#3b82f6", "#fbbf24"] },
  },
  {
    id: "protanopia", name: "Colorblind (red-green)", hint: "Profit = sky, loss = soft red",
    swatch: { bg: "#0a0e27", panel: "#1a1f3a", accents: ["#818cf8", "#0ea5e9", "#f87171"] },
  },
];

const STORAGE_KEY = "od-theme";
const IDS = new Set<string>(THEMES.map((t) => t.id));

function readStored(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && IDS.has(stored) ? (stored as ThemeId) : "dark";
  } catch {
    return "dark";
  }
}

function applyToDom(theme: ThemeId) {
  document.documentElement.className = `theme-${theme}`;
}

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(readStored);

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next);
    applyToDom(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // private mode: theme lives for the session only
    }
  }, []);

  useEffect(() => {
    applyToDom(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial apply
  }, []);

  // Ctrl+Shift+D: quick dark/light flip (brief §5.5 shortcut list)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        setTheme(readStored() === "light" ? "dark" : "light");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
