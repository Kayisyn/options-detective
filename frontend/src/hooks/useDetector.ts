import type { Candidate, UserIntent } from "../types";

// Drives View 1: POST /detect with the user's intent, returns ranked
// candidates. Real implementation lands in Phase 6 against Phase 3.
export function useDetector() {
  return {
    candidates: [] as Candidate[],
    isScreening: false,
    error: null as string | null,
    screen: (_intent: UserIntent) => {},
  };
}
