/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Surfaces + text ride CSS variables (src/index.css) so the Phase 4
      // light mode only has to toggle :root.light — components don't change.
      colors: {
        dark: {
          900: "rgb(var(--od-dark-900) / <alpha-value>)",
          800: "rgb(var(--od-dark-800) / <alpha-value>)",
          700: "rgb(var(--od-dark-700) / <alpha-value>)",
          600: "rgb(var(--od-dark-600) / <alpha-value>)",
          500: "rgb(var(--od-dark-500) / <alpha-value>)",
        },
        content: {
          1: "rgb(var(--od-text-1) / <alpha-value>)", // primary
          2: "rgb(var(--od-text-2) / <alpha-value>)", // secondary
          3: "rgb(var(--od-text-3) / <alpha-value>)", // tertiary / hints
        },
        accent: {
          blue: "#3b82f6",
          green: "#10b981",
          red: "#ef4444",
          orange: "#f59e0b",
          purple: "#a855f7",
          cyan: "#06b6d4",
        },
      },
      // Design-brief radius scale: sm 4 / md 8 / lg 12 / xl 16
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(59 130 246 / 0.4), 0 0 24px rgb(59 130 246 / 0.15)",
      },
      keyframes: {
        "card-enter": {
          "0%": { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        // §3.2 page transitions
        "view-exit": {
          "0%": { opacity: "1", transform: "translateX(0)" },
          "100%": { opacity: "0", transform: "translateX(-20px)" },
        },
        "view-enter": {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
      },
      animation: {
        // "both" so staggered cards stay invisible until their delay hits
        "card-enter": "card-enter 300ms ease-out both",
        "view-exit": "view-exit 200ms ease-in both",
        "view-enter": "view-enter 300ms ease-out both",
      },
    },
  },
  plugins: [],
};
