import { useState } from "react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import { useStore } from "../../store";
import { useTheme } from "../../contexts/ThemeContext";
import {
  buildMeta, buildPositionSummary, deleteFeedback, enqueueFeedback,
  FEEDBACK_TYPES, issueBody, issueTitle, issueUrl, loadFeedbackQueue,
  markFeedbackOpened, type FeedbackEntry, type FeedbackType,
} from "../../lib/feedback";
import { cx } from "../../lib/cx";

// v1.9.1 Feedback & Bugs: type selector, 500-char description, optional
// diagnostics + position-log summary (counts only). Send opens a pre-filled
// GitHub issue in the OS browser — no token ships with the app — and every
// submission is kept in a local queue for offline resilience.

const MAX_CHARS = 500;

export default function FeedbackModal({ open, onClose }: {
  open: boolean;
  onClose: () => void;
}) {
  const account = useStore((s) => s.account);
  const view = useStore((s) => s.view);
  const savedTrades = useStore((s) => s.savedTrades);
  const showToast = useStore((s) => s.showToast);
  const { theme } = useTheme();

  const [type, setType] = useState<FeedbackType>("bug");
  const [text, setText] = useState("");
  const [withDiagnostics, setWithDiagnostics] = useState(true);
  const [withPositions, setWithPositions] = useState(false);
  const [queue, setQueue] = useState<FeedbackEntry[]>(loadFeedbackQueue);

  function makeEntry(): FeedbackEntry {
    return {
      id: crypto.randomUUID(),
      type,
      text: text.trim(),
      meta: withDiagnostics
        ? buildMeta({
            version: __APP_VERSION__,
            theme,
            view,
            username: account?.username ?? "anonymous",
          })
        : null,
      positionSummary: withPositions ? buildPositionSummary(savedTrades) : null,
      status: "queued",
      at: new Date().toISOString(),
    };
  }

  function send() {
    const entry = makeEntry();
    if (navigator.onLine) {
      entry.status = "opened";
      enqueueFeedback(entry);
      window.open(issueUrl(entry), "_blank", "noopener");
      showToast("✓ Opening a pre-filled GitHub issue — hit Submit there to send");
    } else {
      enqueueFeedback(entry);
      showToast("Saved locally — reopen Feedback & Bugs to send when back online");
    }
    setQueue(loadFeedbackQueue());
    setText("");
    onClose();
  }

  async function copy(entry: FeedbackEntry) {
    try {
      await navigator.clipboard.writeText(`${issueTitle(entry)}\n\n${issueBody(entry)}`);
      showToast("✓ Copied to clipboard");
    } catch {
      showToast("Clipboard unavailable");
    }
  }

  function reopen(entry: FeedbackEntry) {
    window.open(issueUrl(entry), "_blank", "noopener");
    markFeedbackOpened(entry.id);
    setQueue(loadFeedbackQueue());
  }

  const queued = queue.filter((e) => e.status === "queued");

  return (
    <Modal open={open} onClose={onClose} testid="feedback-modal" maxWidth="max-w-md">
      <h2 className="text-lg font-semibold">Feedback &amp; Bug Reports</h2>
      <p className="mt-1 text-sm text-content-3">
        Sends as a pre-filled GitHub issue from your own account — review it
        before submitting there.
      </p>

      <fieldset className="mt-3">
        <legend className="text-xs uppercase tracking-wide text-content-3">
          What&apos;s on your mind?
        </legend>
        <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="Report type">
          {FEEDBACK_TYPES.map((t) => (
            <button key={t.id} role="radio" aria-checked={type === t.id}
              data-testid={`feedback-type-${t.id}`}
              onClick={() => setType(t.id)}
              className={cx(
                "rounded-md border px-3 py-1.5 text-sm transition-all duration-150 ease-out-quad",
                type === t.id
                  ? "border-accent-primary bg-accent-primary/15 text-content-1"
                  : "border-white/10 text-content-3 hover:border-accent-primary/50 hover:text-content-1",
              )}>
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-3 block">
        <span className="sr-only">Describe the problem or idea</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
          rows={5}
          placeholder={type === "bug"
            ? "What happened, what you expected, and how to reproduce it…"
            : "Describe the idea or feedback…"}
          data-testid="feedback-text"
          className="w-full resize-y rounded-md border border-white/10 bg-dark-800 px-3 py-2 text-sm text-content-1 placeholder:text-content-3/60 focus:border-accent-primary focus:outline-none"
        />
      </label>
      <div className="mt-0.5 text-right text-xs text-content-3" data-testid="feedback-chars">
        {text.length}/{MAX_CHARS}
      </div>

      <div className="mt-1 space-y-1">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-content-2">
          <input type="checkbox" checked={withDiagnostics}
            onChange={(e) => setWithDiagnostics(e.target.checked)}
            data-testid="feedback-diagnostics"
            className="accent-[rgb(var(--od-accent-primary))]" />
          Include diagnostics (v{__APP_VERSION__}, {theme} theme, current view)
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-content-2">
          <input type="checkbox" checked={withPositions}
            onChange={(e) => setWithPositions(e.target.checked)}
            data-testid="feedback-positions"
            className="accent-[rgb(var(--od-accent-primary))]" />
          Attach position-log summary (counts only, no prices)
        </label>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="secondary" size="sm" disabled={!text.trim()}
          onClick={() => copy(makeEntry())} data-testid="feedback-copy"
          title="Copy the report as text — paste it anywhere">
          Copy
        </Button>
        <Button size="sm" disabled={!text.trim()} onClick={send} data-testid="feedback-send">
          Send Feedback
        </Button>
      </div>

      {queued.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-3" data-testid="feedback-queue">
          <h3 className="text-xs font-medium uppercase tracking-wide text-heading">
            Saved locally ({queued.length})
          </h3>
          <div className="mt-1.5 max-h-32 space-y-1 overflow-y-auto">
            {queued.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-2 rounded-md bg-dark-700/50 px-2.5 py-1.5 text-xs">
                <span className="min-w-0 truncate text-content-2" title={e.text}>
                  {issueTitle(e)} · {e.at.slice(0, 10)}
                </span>
                <span className="flex shrink-0 gap-1">
                  <button className="text-accent-primary-text underline underline-offset-2 hover:brightness-110"
                    onClick={() => reopen(e)}>
                    Open on GitHub
                  </button>
                  <button className="px-1 text-content-3 hover:text-accent-red"
                    aria-label="Delete saved report"
                    onClick={() => { deleteFeedback(e.id); setQueue(loadFeedbackQueue()); }}>
                    ✕
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
