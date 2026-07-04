// Fetches GET /data/:symbol (price, chains, IV rank) with the 60s cache
// living server-side. Real implementation lands in Phase 6 against the
// Phase 2 data layer.
export function useMarketData(_symbol: string | null) {
  return {
    data: null,
    isLoading: false,
    error: null as string | null,
    refresh: () => {},
  };
}
