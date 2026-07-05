import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ModeProvider } from "./contexts/ModeContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ModeProvider>
        <App />
      </ModeProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
