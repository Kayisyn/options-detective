// v1.5.0 animation preference. This user base runs Windows with OS
// "Animation effects" often disabled, which makes prefers-reduced-motion
// permanently true and silently kills every app animation. The app now
// resolves motion from an explicit setting:
//   system (default) — follow prefers-reduced-motion
//   on               — animate regardless of the OS flag (user opted in)
//   off              — never animate
// The resolved state is a `motion-off` class on <html>; index.css keys all
// its kill rules off that class (no @media duplication), and JS callers ask
// motionDisabled() instead of matchMedia directly.

export type MotionPref = "system" | "on" | "off";

const QUERY = "(prefers-reduced-motion: reduce)";
let current: MotionPref = "system";

function resolve(): boolean {
  if (current === "on") return false;
  if (current === "off") return true;
  return typeof matchMedia !== "undefined" && matchMedia(QUERY).matches;
}

export function applyMotionPref(pref: MotionPref) {
  current = pref;
  document.documentElement.classList.toggle("motion-off", resolve());
}

export function motionDisabled(): boolean {
  return document.documentElement.classList.contains("motion-off");
}

// keep "system" mode live when the OS setting flips mid-session
if (typeof matchMedia !== "undefined") {
  matchMedia(QUERY).addEventListener?.("change", () => applyMotionPref(current));
}
