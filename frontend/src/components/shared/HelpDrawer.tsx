import { useEffect, useRef, useState } from "react";
import { GLOSSARY, findEntry, searchGlossary } from "../../lib/glossary";
import { useStore } from "../../store";
import Button from "../ui/Button";
import { cx } from "../../lib/cx";

// Help & glossary drawer (v1.1 roadmap §4). Right-anchored, tabbed by
// glossary section, searchable, deep-linkable: openHelp("delta") scrolls
// to and highlights that entry. External links open in the OS browser
// (Electron routes window.open through shell.openExternal).
export default function HelpDrawer({ onReplayWalkthrough }: {
  onReplayWalkthrough: () => void;
}) {
  const open = useStore((s) => s.helpOpen);
  const topic = useStore((s) => s.helpTopic);
  const closeHelp = useStore((s) => s.closeHelp);
  const [closing, setClosing] = useState(false);
  const [activeSection, setActiveSection] = useState(GLOSSARY[0].id);
  const [query, setQuery] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const failsafe = useRef<ReturnType<typeof setTimeout>>();

  // deep link: jump to the topic's section, then scroll its entry into view
  useEffect(() => {
    if (!open) return;
    setQuery("");
    if (topic) {
      const hit = findEntry(topic);
      if (hit) {
        setActiveSection(hit.section.id);
        setTimeout(() => {
          bodyRef.current
            ?.querySelector(`[data-entry="${topic}"]`)
            ?.scrollIntoView({ block: "center" });
        }, 60);
      }
    }
  }, [open, topic]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => clearTimeout(failsafe.current), []);

  function requestClose() {
    setClosing(true);
    clearTimeout(failsafe.current);
    failsafe.current = setTimeout(finishClose, 300);
  }

  function finishClose() {
    clearTimeout(failsafe.current);
    setClosing(false);
    closeHelp();
  }

  if (!open) return null;

  const sections = query.trim() ? searchGlossary(query) : GLOSSARY;
  const showTabs = !query.trim();
  const visibleSections = showTabs
    ? sections.filter((s) => s.id === activeSection)
    : sections;

  return (
    <div className="fixed inset-0 z-50 bg-black/50" onClick={requestClose} data-testid="help-drawer">
      <aside
        className={cx(
          "absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-white/15 bg-glass shadow-glass backdrop-blur-glass",
          closing ? "animate-drawer-exit" : "animate-drawer-enter",
        )}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={(e) => {
          if (e.target === e.currentTarget && closing) finishClose();
        }}
      >
        <div className="border-b border-dark-700 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Help &amp; glossary</h2>
            <Button variant="ghost" size="xs" onClick={requestClose} aria-label="Close help">✕</Button>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search terms… (delta, POP, condor)"
            data-testid="glossary-search"
            className="w-full rounded-md border border-white/15 bg-dark-700 px-3 py-2 text-sm text-content-1 placeholder:text-content-3 transition-all duration-150 ease-out focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary/30"
          />
          {showTabs && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {GLOSSARY.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  data-glossary-tab={s.id}
                  className={cx(
                    "rounded border px-2 py-1 text-xs transition-all duration-150 ease-out-quad",
                    activeSection === s.id
                      ? "border-accent-primary/60 bg-accent-primary/15 text-accent-primary-text"
                      : "border-dark-600 text-content-3 hover:border-dark-500 hover:text-content-2",
                  )}
                >
                  {s.title}
                </button>
              ))}
            </div>
          )}
        </div>

        <div ref={bodyRef} className="flex-1 space-y-5 overflow-y-auto p-4">
          {visibleSections.length === 0 && (
            <p className="text-sm text-content-3">Nothing matches “{query}”.</p>
          )}
          {visibleSections.map((section) => (
            <div key={section.id}>
              {!showTabs && (
                <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-content-3">
                  {section.title}
                </h3>
              )}
              <div className="space-y-4">
                {section.entries.map((entry) => (
                  <article
                    key={entry.id}
                    data-entry={entry.id}
                    className={cx(
                      "rounded-md p-3",
                      topic === entry.id
                        ? "bg-accent-primary/10 ring-1 ring-accent-primary/40"
                        : "bg-dark-700/40",
                    )}
                  >
                    <h4 className="font-semibold text-content-1">{entry.term}</h4>
                    <p className="mt-1 text-sm text-content-2">{entry.body}</p>
                    {entry.useCase && (
                      <p className="mt-1.5 text-xs text-accent-primary-text">↳ {entry.useCase}</p>
                    )}
                    {entry.link && (
                      <a
                        href={entry.link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-block text-xs text-content-3 underline decoration-dark-500 underline-offset-2 hover:text-content-2"
                      >
                        {entry.link.label} ↗
                      </a>
                    )}
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-dark-700 p-4">
          <Button variant="secondary" size="sm" className="w-full"
            onClick={() => { finishClose(); onReplayWalkthrough(); }}
            data-testid="replay-walkthrough">
            Replay the walkthrough
          </Button>
        </div>
      </aside>
    </div>
  );
}
