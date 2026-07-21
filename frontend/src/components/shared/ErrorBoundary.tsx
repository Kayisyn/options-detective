import { Component, type ErrorInfo, type ReactNode } from "react";

// v1.9.3: crash safety. A render throw anywhere below this boundary (a
// malformed stored trade, an unexpected null from a future data shape)
// would otherwise blank the whole Electron window with no recovery path —
// there's no browser reload button the user reaches for. This catches it and
// offers Try again (re-mount the subtree) / Reload (hard reload). Themed via
// CSS tokens, which live on <html> so they apply even when App failed.

interface Props {
  children: ReactNode;
  /** label for the region that failed, used in the copy */
  label?: string;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // surfaced in the dev console and the Electron main log; no telemetry
    console.error("[ErrorBoundary] render error:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        className="flex min-h-[100dvh] items-center justify-center p-6"
        data-testid="error-boundary"
      >
        <div className="card-glass w-full max-w-md border-accent-red/40 p-6 text-center shadow-glow">
          <div className="mb-2 text-2xl" aria-hidden>⚠</div>
          <h1 className="text-lg font-semibold text-content-1">Something went wrong</h1>
          <p className="mt-2 text-sm text-content-3">
            {this.props.label
              ? `The ${this.props.label} hit an unexpected error.`
              : "The app hit an unexpected error."}{" "}
            Your saved data is untouched — try again, or reload.
          </p>
          <pre className="mt-3 max-h-28 overflow-auto rounded bg-dark-900/60 px-3 py-2 text-left text-xs text-content-3">
            {error.message || String(error)}
          </pre>
          <div className="mt-4 flex justify-center gap-3">
            <button
              onClick={this.reset}
              data-testid="error-retry"
              className="od-btn-primary rounded-md bg-accent-primary px-4 py-2 text-sm font-medium text-on-accent transition-all duration-150 hover:bg-accent-primary-hover"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              data-testid="error-reload"
              className="rounded-md border border-accent-primary/60 bg-accent-primary/10 px-4 py-2 text-sm font-medium text-accent-primary-text transition-all duration-150 hover:bg-accent-primary/20"
            >
              Reload app
            </button>
          </div>
        </div>
      </div>
    );
  }
}
