import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../../lib/cx";

// Long-hover tooltip (§5.2): rest the pointer on a metric for 500ms and an
// explanation fades in over 200ms. Replaces the browser's native title
// tooltips on metric surfaces so timing and styling are consistent.
export default function Hint({ text, children, className }: {
  text: string;
  children: ReactNode;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return (
    <span
      className={cx("relative", className)}
      onMouseEnter={() => {
        timerRef.current = setTimeout(() => setVisible(true), 500);
      }}
      onMouseLeave={() => {
        clearTimeout(timerRef.current);
        setVisible(false);
      }}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          data-testid="hint-tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 w-56 -translate-x-1/2 animate-fade-in rounded-md border border-dark-600 bg-dark-800 p-2 text-xs font-normal normal-case tracking-normal text-content-2 shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  );
}
