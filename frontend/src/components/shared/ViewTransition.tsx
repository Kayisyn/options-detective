import { useEffect, useRef, useState, type ReactNode } from "react";

// Page-level view transitions per ux-design-polish-brief §3.2:
// exit = slideOut 200ms ease-in, then the new view enters with
// slideIn 300ms ease-out. Pure CSS animations sequenced by a tiny state
// machine — no animation library.
//
// The outgoing view's element tree is snapshotted in state so it can keep
// rendering during its exit (by then the parent is already rendering the
// incoming view's children).

interface Snapshot {
  key: string;
  node: ReactNode;
}

export default function ViewTransition({ viewKey, children }: {
  viewKey: string;
  children: ReactNode;
}) {
  const [shown, setShown] = useState<Snapshot>({ key: viewKey, node: children });
  const [exiting, setExiting] = useState(false);
  const pending = useRef<Snapshot | null>(null);
  const failsafe = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (viewKey === shown.key) {
      // same view: keep its content fresh (results arriving, etc.)
      setShown({ key: viewKey, node: children });
      return undefined;
    }
    pending.current = { key: viewKey, node: children };
    setExiting(true);
    // animationend can be swallowed (display:none ancestors, devtools
    // throttling) — never strand the user on the old view
    clearTimeout(failsafe.current);
    failsafe.current = setTimeout(applyPending, 400);
    return () => clearTimeout(failsafe.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shown.key is
    // deliberately read fresh; adding it would re-trigger during the swap
  }, [viewKey, children]);

  function applyPending() {
    clearTimeout(failsafe.current);
    if (pending.current) {
      setShown(pending.current);
      pending.current = null;
    }
    setExiting(false);
  }

  return (
    <div
      className={exiting ? "animate-view-exit" : "animate-view-enter"}
      data-transition={exiting ? "exit" : "enter"}
      onAnimationEnd={(e) => {
        if (e.target !== e.currentTarget) return; // bubbled card animations
        if (exiting) applyPending();
      }}
    >
      {shown.node}
    </div>
  );
}
