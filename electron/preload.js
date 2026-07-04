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
});
