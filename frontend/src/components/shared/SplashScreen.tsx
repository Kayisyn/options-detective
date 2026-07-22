import { useEffect, useState } from "react";
import ObeliskInsignia from "./ObeliskInsignia";
import { cx } from "../../lib/cx";

// v1.10.2 launch splash. Replaces the bare loading bar: the Obelisk insignia
// fades in and pulses with the theme accent glow while the backend and math
// artifacts come up, then the whole overlay crossfades out to reveal the app
// behind it. Theme-aware (glow rides --od-accent-primary); the default theme
// is Amethyst on first launch.
export default function SplashScreen({
  leaving, onExited,
}: {
  /** boot finished — begin the fade-out */
  leaving: boolean;
  /** called once the fade-out completes so the parent can unmount us */
  onExited: () => void;
}) {
  const [gone, setGone] = useState(false);

  // when leaving, fade out then notify the parent (with a failsafe in case the
  // transitionend is swallowed)
  useEffect(() => {
    if (!leaving) return undefined;
    const t = setTimeout(onExited, 550);
    return () => clearTimeout(t);
  }, [leaving, onExited]);

  if (gone) return null;

  return (
    <div
      data-testid="splash-screen"
      onTransitionEnd={() => { if (leaving) { setGone(true); onExited(); } }}
      className={cx(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-dark-900",
        "transition-opacity duration-500 ease-out",
        leaving ? "pointer-events-none opacity-0" : "opacity-100",
      )}
    >
      <ObeliskInsignia size={104} glow title="Option Obelisk" />
      <div className="animate-fade-in text-center" style={{ animationDelay: "150ms" }}>
        <div className="text-2xl font-bold tracking-tight text-content-1">Option Obelisk</div>
        <div className="mt-1 text-sm text-content-3">Loading your workspace…</div>
      </div>
    </div>
  );
}
