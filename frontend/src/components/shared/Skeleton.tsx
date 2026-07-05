import { cx } from "../../lib/cx";

// Loading skeletons per brief §3.4 + §5.2: whole placeholders breathe with
// the Tailwind pulse; sibling cards are offset by 100ms so the pulse rolls
// through the list as a wave. A striped progress bar sits above the
// Detector skeleton while the screen is actually running.

export function Skeleton({ className, pulse = true }: {
  className?: string;
  pulse?: boolean;
}) {
  return (
    <div className={cx(pulse && "animate-pulse", "rounded-md bg-dark-700", className)} />
  );
}

// §5.2 progress bar: animated stripe pattern while work is in flight.
export function ProgressStripes() {
  return (
    <div className="h-1.5 overflow-hidden rounded-full" data-testid="progress-stripes">
      <div
        className="animate-stripe-slide h-full w-full"
        style={{
          background: "repeating-linear-gradient(45deg, rgb(var(--od-accent-blue)) 0 10px, rgb(var(--od-accent-blue) / 0.55) 10px 20px)",
          backgroundSize: "20px 20px",
        }}
      />
    </div>
  );
}

export function CandidateCardSkeleton({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div
      className="animate-pulse rounded-lg border border-dark-700 bg-dark-800 p-4 shadow-md"
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
    <div className="grid gap-4 lg:grid-cols-5" data-testid="calculator-skeleton">
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
    <div className="grid gap-3 lg:grid-cols-2" data-testid="recommender-skeleton">
      {Array.from({ length: 4 }, (_, i) => (
        <CandidateCardSkeleton key={i} delayMs={i * 100} />
      ))}
    </div>
  );
}
