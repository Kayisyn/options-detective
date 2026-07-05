import {
  createContext, useCallback, useContext, useState, type ReactNode,
} from "react";

// Beginner/Expert complexity toggle (updated brief §4.3). Expert is the
// default — the app was built for semi-technical traders; beginners opt
// into the simplified reading, they are not forced through it.
//
// Beginner mode hides greeks/scores behind plain-language summaries;
// expert mode shows everything. Components consume `expertMode` and the
// explainer variants — no view forks.

const STORAGE_KEY = "od-mode";

interface ModeContextValue {
  expertMode: boolean;
  toggleMode: () => void;
}

const ModeContext = createContext<ModeContextValue>({
  expertMode: true,
  toggleMode: () => {},
});

export function ModeProvider({ children }: { children: ReactNode }) {
  const [expertMode, setExpertMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "beginner";
    } catch {
      return true;
    }
  });

  const toggleMode = useCallback(() => {
    setExpertMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "expert" : "beginner");
      } catch {
        // session-only in private mode
      }
      return next;
    });
  }, []);

  return (
    <ModeContext.Provider value={{ expertMode, toggleMode }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  return useContext(ModeContext);
}
