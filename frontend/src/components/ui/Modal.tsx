import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../../lib/cx";

// Modal shell, v1.4.0: glassmorphic panel with a violet edge glow. Enters
// with slide-up + scale 0.95 -> 1 over 250ms ease-out, exits with the
// reverse over 150ms ease-in, then unmounts. Backdrop click and Escape
// both close.
export default function Modal({
  open, onClose, children, testid, maxWidth = "max-w-xl", flush = false,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  testid?: string;
  maxWidth?: string;
  /** no built-in padding; panel becomes a max-height flex column so the
      caller can pin a header and scroll the body (Settings) */
  flush?: boolean;
}) {
  const [closing, setClosing] = useState(false);
  const failsafe = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(failsafe.current), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function requestClose() {
    setClosing(true);
    // if animationend is swallowed, still close
    clearTimeout(failsafe.current);
    failsafe.current = setTimeout(finishClose, 300);
  }

  function finishClose() {
    clearTimeout(failsafe.current);
    setClosing(false);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm animate-fade-in"
      onClick={requestClose}
      data-testid={testid}
    >
      <div
        className={cx(
          "card-glass w-full border-accent-primary/30 shadow-glow",
          flush ? "flex max-h-[85vh] flex-col overflow-hidden" : "p-6",
          maxWidth,
          closing ? "animate-modal-exit" : "animate-modal-enter",
        )}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget && closing) finishClose();
        }}
      >
        {children}
      </div>
    </div>
  );
}
