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
          blue: "rgb(var(--od-accent-blue) / <alpha-value>)",
          green: "rgb(var(--od-accent-green) / <alpha-value>)",
          red: "rgb(var(--od-accent-red) / <alpha-value>)",
          orange: "rgb(var(--od-accent-orange) / <alpha-value>)",
          purple: "#a855f7",
          cyan: "#06b6d4",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "monospace"],
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
        glow: "0 0 0 1px rgb(var(--od-accent-blue) / 0.4), 0 0 24px rgb(var(--od-accent-blue) / 0.15)",
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
        // §5.1 micro-animations
        "badge-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-5px)" },
          "75%": { transform: "translateX(5px)" },
        },
        "valid-check": {
          "0%": { opacity: "0", transform: "scale(0.5)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        ripple: {
          "0%": { transform: "scale(0)", opacity: "0.5" },
          "100%": { transform: "scale(4)", opacity: "0" },
        },
        "value-flash": {
          "0%": { backgroundColor: "rgb(250 204 21 / 0.35)" },
          "100%": { backgroundColor: "transparent" },
        },
        // §5.2 gesture feedback
        "bounce-down": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(8px)" },
        },
        "stripe-slide": {
          "0%": { backgroundPosition: "0 0" },
          "100%": { backgroundPosition: "20px 0" },
        },
        // §5.3 modals, §3.5 toasts
        "modal-enter": {
          "0%": { opacity: "0", transform: "translateY(20px) scale(0.95)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "modal-exit": {
          "0%": { opacity: "1", transform: "translateY(0) scale(1)" },
          "100%": { opacity: "0", transform: "translateY(20px) scale(0.95)" },
        },
        "toast-in": {
          "0%": { opacity: "0", transform: "translateY(-10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "drawer-enter": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "drawer-exit": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(100%)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        // "both" so staggered cards stay invisible until their delay hits
        "card-enter": "card-enter 300ms ease-out both",
        "view-exit": "view-exit 200ms ease-in both",
        "view-enter": "view-enter 300ms ease-out both",
        "badge-pulse": "badge-pulse 300ms ease-in-out",
        shake: "shake 100ms ease-in-out 2",
        "valid-check": "valid-check 100ms ease-out both",
        ripple: "ripple 300ms ease-out forwards",
        "value-flash": "value-flash 200ms ease-out",
        "bounce-down": "bounce-down 2s ease-in-out infinite",
        "stripe-slide": "stripe-slide 1s linear infinite",
        "modal-enter": "modal-enter 200ms ease-out both",
        "modal-exit": "modal-exit 150ms ease-in both",
        "toast-in": "toast-in 300ms ease-out both",
        "fade-in": "fade-in 200ms ease-out both",
        "drawer-enter": "drawer-enter 200ms ease-out both",
        "drawer-exit": "drawer-exit 150ms ease-in both",
      },
    },
  },
  plugins: [],
};
