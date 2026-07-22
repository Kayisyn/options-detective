import {
  createContext, useCallback, useContext, useEffect, useState,
  type ReactNode,
} from "react";

// Themes: Amethyst — the locked violet-glass aesthetic (default, id
// "dark"), Obsidian — the Black & White finance-terminal mode (id "bw";
// pure black, grayscale accents, flat surfaces — index.css disables the
// glass effects under .theme-bw), and v1.6.1's Emerald Green (emerald
// titles, jade headers, MINT profit numbers). Display names renamed
// 2026-07 (Obsidian→Amethyst, Black & White→Obsidian); ids never change.
// The theme is a class on <html>; every component reads CSS variables, so
// switching is instant and touches no component code. The default keeps the
// id "dark" so stored preferences from earlier versions still apply; stored
// ids of retired themes (light/neon/professional/deuteranopia/protanopia)
// fall back to obsidian.

export type ThemeId = "dark" | "green" | "bw" | "opal";

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  hint: string;
  swatch: { bg: string; panel: string; accents: [string, string, string] };
}

export const THEMES: ThemeMeta[] = [
  {
    id: "dark", name: "Amethyst", hint: "Default, amethyst glass, violet accents",
    swatch: { bg: "#0a0a0f", panel: "#15151f", accents: ["#9733FF", "#10b981", "#ef4444"] },
  },
  {
    id: "green", name: "Emerald", hint: "Terminal green, emerald titles, mint profits",
    swatch: { bg: "#0a0f0a", panel: "#1a201a", accents: ["#10b981", "#6ee7b7", "#ef4444"] },
  },
  {
    id: "bw", name: "Obsidian", hint: "Finance terminal, pure black & white, formal aesthetic",
    swatch: { bg: "#000000", panel: "#1a1a1a", accents: ["#ffffff", "#ebebeb", "#969696"] },
  },
  {
    id: "opal", name: "Opal", hint: "Light mode. Clean surfaces, muted teal accents, formal finance aesthetic.",
    swatch: { bg: "#fbfcfd", panel: "#ffffff", accents: ["#2f8f76", "#059669", "#dc2626"] },
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

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
