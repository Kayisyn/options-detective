import { useEffect, useRef, useState } from "react";
import { cx } from "../../lib/cx";

// Number counter (§5.1): first appearance counts 0 -> value over ~200ms;
// later updates count from the previous value AND flash briefly. Only the
// displayed number is interpolated — the real value always comes from the
// backend and is what the animation lands on.

function reducedMotion(): boolean {
  return typeof matchMedia !== "undefined"
    && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function CountUp({ to, format, durationMs = 200, className }: {
  to: number;
  format: (n: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(() => (reducedMotion() ? to : 0));
  const [flashing, setFlashing] = useState(false);
  const fromRef = useRef(reducedMotion() ? to : 0);
  const firstRef = useRef(true);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (reducedMotion() || from === to) {
      setDisplay(to);
      fromRef.current = to;
      firstRef.current = false;
      return undefined;
    }
    if (!firstRef.current) {
      setFlashing(true); // §5.1 value-change highlight
    }
    firstRef.current = false;
    const startedAt = performance.now();
    function tick(now: number) {
      const t = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - (1 - t) * (1 - t); // ease-out
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [to, durationMs]);

  return (
    <span
      className={cx(flashing && "animate-value-flash inline-block rounded-sm", className)}
      onAnimationEnd={() => setFlashing(false)}
      data-testid="countup"
    >
      {format(display)}
    </span>
  );
}
