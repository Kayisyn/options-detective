import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cx } from "../../lib/cx";

// Form controls per ux-design-polish-brief §2.3. All state changes 150ms
// ease-out, focus gets the glow treatment (border + ring + shadow).

const BASE_FIELD = cx(
  "rounded-md border-2 bg-dark-700 text-content-1 placeholder:text-content-3",
  "transition-all duration-150 ease-out",
  "hover:border-dark-500",
  "focus:border-blue-500 focus:shadow-lg focus:outline-none focus:ring-1 focus:ring-blue-500/30",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

// Compact single-line fields embedded in tables (Calculator strike editor).
export const compactFieldClasses = cx(
  BASE_FIELD, "border", "border-dark-600 px-2 py-1 text-sm tabular-nums",
);

function stateClasses(error?: string, success?: boolean) {
  if (error) return "border-red-600 focus:border-red-500 focus:ring-red-500/30";
  if (success) return "border-green-600";
  return "border-dark-600";
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
      <span className="text-xs uppercase tracking-wide text-content-3 transition-colors duration-150 group-focus-within:text-blue-400">
        {label}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-400">{error}</span>}
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
  return (
    <FieldShell label={label} hint={hint} error={error} className={containerClassName}>
      <input
        className={cx("mt-1 block px-3 py-2.5 text-sm", BASE_FIELD,
          stateClasses(error, success), className)}
        {...rest}
      />
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
