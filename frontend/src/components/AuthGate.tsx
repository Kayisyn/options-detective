import { useState, type FormEvent } from "react";
import { useStore } from "../store";
import Button from "./ui/Button";
import ObeliskInsignia from "./shared/ObeliskInsignia";
import { friendlyError } from "../lib/friendlyError";
import { cx } from "../lib/cx";

// v1.6.0 local-accounts sign-in gate. Renders before the app when no account
// is active. Sign in to an existing local profile, or create a new one — both
// password-protected (scrypt on the backend). No email verification in the
// local model; creating an account signs straight in.

const USERNAME_RE = /^[A-Za-z0-9]{3,20}$/;
const RULES: Array<{ label: string; test: (p: string) => boolean }> = [
  { label: "8+ characters", test: (p) => p.length >= 8 },
  { label: "lowercase", test: (p) => /[a-z]/.test(p) },
  { label: "uppercase", test: (p) => /[A-Z]/.test(p) },
  { label: "number", test: (p) => /[0-9]/.test(p) },
];

const FIELD = cx(
  "od-input mt-1 w-full rounded-md border border-white/15 bg-dark-700 px-3 py-2.5 text-sm",
  "text-content-1 placeholder:text-content-3 transition-all duration-150 ease-out-quad",
  "focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary/30",
);

export default function AuthGate() {
  const accounts = useStore((s) => s.accounts);
  const busy = useStore((s) => s.authBusy);
  const login = useStore((s) => s.login);
  const register = useStore((s) => s.register);

  const [mode, setMode] = useState<"signin" | "create">(
    accounts.length === 0 ? "create" : "signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passed = RULES.map((r) => r.test(password));
  const strength = passed.filter(Boolean).length;
  const usernameOk = USERNAME_RE.test(username.trim());
  const createValid = usernameOk && strength === 4 && password === confirm && confirm !== "";
  const signinValid = username.trim() !== "" && password !== "";
  const canSubmit = !busy && (mode === "create" ? createValid : signinValid);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (mode === "create") await register(username.trim(), password, remember);
      else await login(username.trim(), password, remember);
      // on success the store sets `account`; App swaps to the main app
    } catch (err) {
      // full error to the console for debugging; a safe message to the user.
      // login always shows the same non-enumerating message.
      console.error("[auth]", mode, "failed:", err);
      setError(friendlyError(err, mode === "create" ? "register" : "login"));
    }
  }

  function switchMode(next: "signin" | "create") {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirm("");
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4">
      <div className="card-glass liquid-glass w-full max-w-sm p-8" data-testid="auth-gate">
        <div className="mb-6 text-center">
          {/* v1.10.2: the Obelisk insignia replaces the old pill placeholder */}
          <div className="mb-3 flex justify-center">
            <ObeliskInsignia size={56} glow title="Option Obelisk" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Option Obelisk</h1>
          <p className="mt-1 text-sm text-content-3">
            {mode === "create"
              ? accounts.length === 0 ? "Create your account to get started" : "Create a new account"
              : "Sign in to your account"}
          </p>
        </div>

        {/* quick-pick existing accounts when signing in */}
        {mode === "signin" && accounts.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5" data-testid="account-chips">
            {accounts.map((a) => (
              <button
                key={a.id} type="button"
                onClick={() => setUsername(a.username)}
                className={cx(
                  "rounded border px-2.5 py-1 text-xs transition-all duration-150 ease-out-quad",
                  username === a.username
                    ? "border-accent-primary/60 bg-accent-primary/15 text-accent-primary-text"
                    : "border-dark-600 text-content-3 hover:border-dark-500 hover:text-content-2",
                )}
              >
                {a.username}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-content-3">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus autoComplete="username" data-testid="auth-username"
              className={FIELD} placeholder="trader123"
            />
            {mode === "create" && username !== "" && !usernameOk && (
              <span className="mt-1 block text-xs text-accent-red">3–20 letters or numbers</span>
            )}
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wide text-content-3">Password</span>
            <span className="relative mt-1 block">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "create" ? "new-password" : "current-password"}
                data-testid="auth-password"
                className={cx(FIELD, "mt-0 pr-16")}
                placeholder="••••••••"
              />
              <button
                type="button" onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-content-3 transition-colors hover:text-content-1"
                tabIndex={-1}
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </span>
          </label>

          {mode === "create" && (
            <>
              <label className="block">
                <span className="text-xs uppercase tracking-wide text-content-3">Confirm password</span>
                <input
                  type={showPw ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password" data-testid="auth-confirm"
                  className={FIELD} placeholder="••••••••"
                />
                {confirm !== "" && confirm !== password && (
                  <span className="mt-1 block text-xs text-accent-red">Passwords don't match</span>
                )}
              </label>

              {/* strength meter + rule checklist */}
              <div data-testid="auth-strength">
                <div className="flex gap-1">
                  {RULES.map((r, i) => (
                    <span key={r.label} className={cx(
                      "h-1 flex-1 rounded-full transition-colors duration-150",
                      i < strength
                        ? strength === 4 ? "bg-accent-green" : "bg-accent-primary"
                        : "bg-dark-600",
                    )} />
                  ))}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                  {RULES.map((r, i) => (
                    <span key={r.label} className={passed[i] ? "text-accent-green" : "text-content-3"}>
                      {passed[i] ? "✓" : "○"} {r.label}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          <label className="flex items-center gap-2 text-sm text-content-2">
            <input
              type="checkbox" checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              data-testid="auth-remember"
              className="accent-accent-primary"
            />
            Keep me signed in on this machine
          </label>

          {error && (
            <div className="rounded-md border border-accent-red/40 bg-accent-red/10 px-3 py-2 text-sm text-accent-red"
              data-testid="auth-error">
              {error}
            </div>
          )}

          <Button type="submit" size="lg" className="od-halo w-full" disabled={!canSubmit}
            data-testid="auth-submit">
            {busy ? "Please wait…" : mode === "create" ? "Create account" : "Sign in"}
          </Button>
        </form>

        <div className="mt-4 text-center text-sm text-content-3">
          {mode === "create" ? (
            <>
              {accounts.length > 0 && (
                <>Already have an account?{" "}
                  <button className="text-accent-primary-text hover:underline"
                    data-testid="auth-to-signin" onClick={() => switchMode("signin")}>
                    Sign in
                  </button>
                </>
              )}
            </>
          ) : (
            <>Need an account?{" "}
              <button className="text-accent-primary-text hover:underline"
                data-testid="auth-to-create" onClick={() => switchMode("create")}>
                Create one
              </button>
            </>
          )}
        </div>

        <p className="mt-5 text-center text-[11px] text-content-3">
          Local profiles keep your positions separate on this machine. Data is
          stored unencrypted on your device.
        </p>
      </div>
    </div>
  );
}
