const { contextBridge, ipcRenderer } = require("electron");

// The renderer talks to the backend exclusively through this bridge.
// The api:* channels are implemented in main.js during Phase 7; payload
// shapes match docs/api-schema.md.
contextBridge.exposeInMainWorld("optionsDetective", {
  detect: (payload) => ipcRenderer.invoke("api:detect", payload),
  calculate: (payload) => ipcRenderer.invoke("api:calculate", payload),
  recommend: (payload) => ipcRenderer.invoke("api:recommend", payload),
  getMarketData: (symbol) => ipcRenderer.invoke("api:data", { symbol }),
  exportTrade: (text) => ipcRenderer.invoke("api:export", { text }),
  listTrades: () => ipcRenderer.invoke("api:trades:list"),
  saveTrade: (payload) => ipcRenderer.invoke("api:trades:save", payload),
  patchTrade: (id, payload) => ipcRenderer.invoke("api:trades:patch", { id, payload }),
  closeTrade: (id, payload) => ipcRenderer.invoke("api:trades:close", { id, payload }),
  deleteTrade: (id) => ipcRenderer.invoke("api:trades:delete", { id }),
  refreshMarks: () => ipcRenderer.invoke("api:trades:marks"),
  paperGet: () => ipcRenderer.invoke("api:paper:get"),
  paperBudget: (payload) => ipcRenderer.invoke("api:paper:budget", payload),
  paperOpen: (payload) => ipcRenderer.invoke("api:paper:open", payload),
  paperClose: (id, payload) => ipcRenderer.invoke("api:paper:close", { id, payload }),
  paperProcess: () => ipcRenderer.invoke("api:paper:process"),
  paperCurve: (days) => ipcRenderer.invoke("api:paper:curve", { days }),
  paperReset: (payload) => ipcRenderer.invoke("api:paper:reset", payload),
  paperSettings: (payload) => ipcRenderer.invoke("api:paper:settings", payload),
  paperSellHolding: (symbol, payload) => ipcRenderer.invoke("api:paper:sell", { symbol, payload }),
  etfReference: () => ipcRenderer.invoke("api:etf:reference"),
  etfUniverse: () => ipcRenderer.invoke("api:etf:universe"),
  etfScreen: (payload) => ipcRenderer.invoke("api:etf:screen", payload),
  etfRefresh: (payload) => ipcRenderer.invoke("api:etf:refresh", payload),
  etfDetail: (ticker) => ipcRenderer.invoke("api:etf:detail", { ticker }),
  etfWatchlist: () => ipcRenderer.invoke("api:etf:watchlist:get"),
  etfWatchToggle: (payload) => ipcRenderer.invoke("api:etf:watchlist:set", payload),
  icsHoldings: (ticker) => ipcRenderer.invoke("api:ics:holdings", { ticker }),
  icsBatch: (payload) => ipcRenderer.invoke("api:ics:batch", payload),
  marketPulse: (watch) => ipcRenderer.invoke("api:market:pulse", { watch }),
});
