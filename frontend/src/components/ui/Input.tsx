import { useEffect, useRef, useState } from "react";
import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cx } from "../../lib/cx";

// Form controls, v1.4.0 obsidian overhaul: obsidian-surface fields with a
// glass border; focus gets the violet glow treatment. All state changes
// 150ms ease-out.

const BASE_FIELD = cx(
  // od-input: v1.5.0 breathing focus glow (index.css)
  "od-input rounded-md border bg-dark-700 text-content-1 placeholder:text-content-2/30",
  "transition-all duration-150 ease-out-quad",
  "hover:border-dark-500",
  "focus:border-accent-primary focus:shadow-accent-glow focus:outline-none focus:ring-1 focus:ring-accent-primary/30",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

// Compact single-line fields embedded in tables (Trade Analyzer strike editor).
export const compactFieldClasses = cx(
  BASE_FIELD, "border-white/15 px-2 py-1 text-sm tabular-nums",
);

function stateClasses(error?: string, success?: boolean) {
  if (error) return "border-accent-red/70 focus:border-accent-red focus:ring-accent-red/30 focus:shadow-none";
  if (success) return "border-accent-green/70";
  return "border-white/15";
}

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}

// Label lights up while its field has focus — clear "this is active" cue.
function FieldShell({ label, hint, error, className, children }: FieldShellProps) {
  return (
    <label className={cx("group block", className)} title={hint}>
      <span className="text-xs uppercase tracking-wide text-content-3 transition-colors duration-150 group-focus-within:text-accent-primary-text">
        {label}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-accent-red">{error}</span>}
    </label>
  );
}

export interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  success?: boolean;
  containerClassName?: string;
}

export function FormInput({
  label, hint, error, success, containerClassName, className, ...rest
}: FormInputProps) {
  // validation feedback: shake once when a NEW error appears,
  // scale-in a checkmark when the field turns valid.
  const [shaking, setShaking] = useState(false);
  const prevError = useRef<string | undefined>(error);
  useEffect(() => {
    if (error && error !== prevError.current) setShaking(true);
    prevError.current = error;
  }, [error]);

  return (
    <FieldShell label={label} hint={hint} error={error} className={containerClassName}>
      <span className="relative block">
        <input
          className={cx("mt-1 block w-full px-3 py-2.5 text-sm", BASE_FIELD,
            stateClasses(error, success), shaking && "animate-shake", className)}
          onAnimationEnd={() => setShaking(false)}
          {...rest}
        />
        {success && !error && (
          <span
            data-testid="valid-check"
            className="animate-valid-check pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-bold text-accent-green"
          >
            ✓
          </span>
        )}
      </span>
    </FieldShell>
  );
}

export interface FormSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
}

export function FormSelect({
  label, hint, error, containerClassName, className, children, ...rest
}: FormSelectProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={containerClassName}>
      <select
        className={cx("mt-1 block px-3 py-2.5 text-sm", BASE_FIELD,
          stateClasses(error, false), className)}
        {...rest}
      >
        {children}
      </select>
    </FieldShell>
  );
}
