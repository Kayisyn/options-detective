/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Surfaces + text ride CSS variables (src/index.css); v1.4.0 points
      // them at the obsidian palette. Components never hardcode colors.
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
        // text sitting ON a primary fill: white on violet (obsidian),
        // black on white (Black & White theme). Top-level so the utility
        // is `text-on-accent`.
        "on-accent": "rgb(var(--od-on-accent) / <alpha-value>)",
        accent: {
          // violet primary: CTAs, active states, highlights. `primary-text`
          // is the AA-safe tint for small text on obsidian (see index.css).
          primary: "rgb(var(--od-accent-primary) / <alpha-value>)",
          "primary-hover": "rgb(var(--od-accent-primary-hover) / <alpha-value>)",
          "primary-text": "rgb(var(--od-accent-primary-text) / <alpha-value>)",
          blue: "rgb(var(--od-accent-blue) / <alpha-value>)",
          green: "rgb(var(--od-accent-green) / <alpha-value>)",
          red: "rgb(var(--od-accent-red) / <alpha-value>)",
          orange: "rgb(var(--od-accent-orange) / <alpha-value>)",
          cyan: "#06b6d4",
        },
      },
      backgroundColor: {
        glass: "rgb(var(--od-glass-fill) / 0.8)",
        "glass-light": "rgb(var(--od-glass-fill) / 0.6)",
      },
      backdropBlur: {
        glass: "30px",
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
        glass: "0 8px 32px rgba(0, 0, 0, 0.2)",
        // glows ride the accent primary: violet on obsidian, white on B&W
        "glass-lg": "0 8px 32px rgb(var(--od-accent-primary) / 0.25)",
        "accent-glow": "0 0 24px rgb(var(--od-accent-primary) / 0.5)",
        glow: "0 0 0 1px rgb(var(--od-accent-primary) / 0.4), 0 0 24px rgb(var(--od-accent-primary) / 0.15)",
      },
      transitionTimingFunction: {
        // enter / hover / exit curves (v1.4.0 motion spec)
        swift: "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-quad": "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        "in-exit": "cubic-bezier(0.7, 0, 0.84, 0)",
      },
      keyframes: {
        "card-enter": {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.96)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        // page transitions: slide + fade + settle-in scale
        "view-exit": {
          "0%": { opacity: "1", transform: "translateX(0) scale(1)" },
          "100%": { opacity: "0", transform: "translateX(-20px) scale(0.99)" },
        },
        "view-enter": {
          "0%": { opacity: "0", transform: "translateX(20px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateX(0) scale(1)" },
        },
        // micro-animations
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
        // metric update: accent flash + scale pulse (GPU: opacity/transform
        // ride the pseudo-flash via background-color on a tiny inline span);
        // flash color follows the theme (violet / white at 20%)
        "value-flash": {
          "0%": { backgroundColor: "rgb(var(--od-accent-primary) / 0.2)", transform: "scale(1)" },
          "40%": { transform: "scale(1.05)" },
          "100%": { backgroundColor: "transparent", transform: "scale(1)" },
        },
        // v1.5.0 loading bar: the glowing runner (w-1/3 of its track)
        // sweeps fully across and back — transform only
        "loader-slide": {
          "0%, 100%": { transform: "translateX(-110%)" },
          "50%": { transform: "translateX(410%)" },
        },
        skeleton: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        // modals, toasts, drawers
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
        "card-enter": "card-enter 300ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "view-exit": "view-exit 200ms cubic-bezier(0.7, 0, 0.84, 0) both",
        "view-enter": "view-enter 300ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "badge-pulse": "badge-pulse 300ms ease-in-out",
        shake: "shake 100ms ease-in-out 2",
        "valid-check": "valid-check 100ms ease-out both",
        ripple: "ripple 300ms ease-out forwards",
        "value-flash": "value-flash 300ms ease-out",
        "loader-slide": "loader-slide 2s ease-in-out infinite",
        skeleton: "skeleton 1.5s ease-in-out infinite",
        "modal-enter": "modal-enter 250ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "modal-exit": "modal-exit 150ms cubic-bezier(0.7, 0, 0.84, 0) both",
        "toast-in": "toast-in 300ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 200ms ease-out both",
        "drawer-enter": "drawer-enter 250ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "drawer-exit": "drawer-exit 150ms cubic-bezier(0.7, 0, 0.84, 0) both",
      },
    },
  },
  plugins: [],
};
