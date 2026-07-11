import { cx } from "../../lib/cx";

// Loading skeletons: glassmorphic placeholders breathe with a gentle 1.5s
// pulse; sibling cards are offset by 100ms so the pulse rolls through the
// list as a wave. A violet striped progress bar sits above the Screener
// skeleton while the screen is actually running.

export function Skeleton({ className, pulse = true }: {
  className?: string;
  pulse?: boolean;
}) {
  return (
    <div className={cx(pulse && "animate-skeleton", "rounded-md bg-dark-700", className)} />
  );
}

// v1.5.0 loading bar: a thin glowing line sweeps left-to-right-to-left on
// a 2s cycle (transform-only). Replaces the striped bar; keeps the export
// name and testid so all call sites stay wired.
export function ProgressStripes() {
  return (
    <div className="relative h-[3px] overflow-hidden" data-testid="progress-stripes">
      <div
        className="animate-loader-slide absolute inset-y-0 w-1/3 rounded-full"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgb(var(--od-accent-primary) / 0.9) 50%, transparent)",
          boxShadow: "0 0 10px rgb(var(--od-accent-primary) / 0.8)",
        }}
      />
    </div>
  );
}

export function CandidateCardSkeleton({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div
      className="card-glass animate-skeleton p-4"
      style={{ animationDelay: `${delayMs}ms` }}
      data-testid="card-skeleton"
    >
      <div className="mb-3 flex items-center justify-between border-b border-dark-700 pb-3">
        <div className="space-y-2">
          <Skeleton pulse={false} className="h-5 w-36" />
          <Skeleton pulse={false} className="h-3 w-24" />
        </div>
        <Skeleton pulse={false} className="h-6 w-20" />
      </div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Skeleton pulse={false} className="h-14" />
        <Skeleton pulse={false} className="h-14" />
        <Skeleton pulse={false} className="h-14" />
      </div>
      <div className="flex gap-2">
        <Skeleton pulse={false} className="h-8 w-24" />
        <Skeleton pulse={false} className="h-8 w-20" />
      </div>
    </div>
  );
}

export function DetectorSkeleton() {
  return (
    <div className="space-y-4" data-testid="detector-skeleton">
      <ProgressStripes />
      <Skeleton className="h-11" />
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <CandidateCardSkeleton key={i} delayMs={i * 100} />
        ))}
      </div>
    </div>
  );
}

export function CalculatorSkeleton() {
  return (
    <div className="space-y-4" data-testid="calculator-skeleton">
      <ProgressStripes />
      <CalculatorSkeletonBody />
    </div>
  );
}

function CalculatorSkeletonBody() {
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="space-y-3 lg:col-span-3">
        <Skeleton className="h-72" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      </div>
      <div className="space-y-4 lg:col-span-2">
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
        <Skeleton className="h-40" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      </div>
    </div>
  );
}

export function RecommenderSkeleton() {
  return (
    <div className="space-y-4" data-testid="recommender-skeleton">
      <ProgressStripes />
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <CandidateCardSkeleton key={i} delayMs={i * 100} />
        ))}
      </div>
    </div>
  );
}
