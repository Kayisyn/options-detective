import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../../lib/cx";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), ' +
  'input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Modal shell, v1.4.0: glassmorphic panel with a violet edge glow. Enters
// with slide-up + scale 0.95 -> 1 over 250ms ease-out, exits with the
// reverse over 150ms ease-in, then unmounts. Backdrop click and Escape
// both close.
// v1.9.3 a11y: role=dialog/aria-modal, focus moves into the panel on open,
// Tab is trapped inside, and focus returns to the trigger on close.
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
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => () => clearTimeout(failsafe.current), []);

  // move focus into the panel on open; restore it to the trigger on close
  useEffect(() => {
    if (!open) return undefined;
    restoreRef.current = document.activeElement as HTMLElement | null;
    // the panel is in the DOM by the time this effect runs; focus its first
    // control (fall back to the panel itself). No rAF — focus needs no paint,
    // and rAF is throttled in background/automated contexts.
    const focusFirst = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? panel).focus();
    };
    focusFirst();
    // belt-and-suspenders: if content mounted a tick late, retry once
    const t = setTimeout(focusFirst, 0);
    return () => {
      clearTimeout(t);
      // return focus to whatever was focused before the modal opened
      restoreRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape") {
        requestClose();
        return;
      }
      if (e.key !== "Tab") return;
      // focus trap: keep Tab / Shift+Tab cycling within the panel
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => el.offsetParent !== null); // visible only
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel.contains(active))) {
        e.preventDefault();
        first.focus();
      }
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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cx(
          "card-glass liquid-glass w-full border-accent-primary/30 shadow-glow outline-none",
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
