// v1.5.1 performance debug toggles. Liquid glass and glow effects are gated
// by classes on <html> (mirroring motionPref's `motion-off`), so turning one
// off is a single class flip and every CSS rule keys off it — no per-element
// state. Parallax is handled in JS (ParticleField reads the store flag).

export interface FxClassPrefs {
  liquidGlass: boolean;
  glow: boolean;
}

export function applyFxClasses({ liquidGlass, glow }: FxClassPrefs) {
  const root = document.documentElement;
  root.classList.toggle("fx-no-liquid", !liquidGlass);
  root.classList.toggle("fx-no-glow", !glow);
}
