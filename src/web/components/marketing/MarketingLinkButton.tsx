import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-fg text-fg-on-accent hover:bg-[#1f1d18] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
  secondary:
    "bg-surface text-fg hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
  ghost:
    "bg-transparent text-fg hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-4 text-[14px]",
  lg: "h-11 px-6 text-[15px]",
};

interface MarketingLinkButtonProps extends ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
}

export function MarketingLinkButton({
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: MarketingLinkButtonProps) {
  return (
    <Link
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}
