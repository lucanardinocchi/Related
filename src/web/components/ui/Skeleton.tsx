import { cn } from "@/lib/cn";

interface SkeletonProps {
  className?: string;
}

/**
 * Loading placeholder. Use with explicit width/height utility classes —
 * the primitive itself only provides the background colour and pulse.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded bg-surface-2",
        className,
      )}
    />
  );
}
