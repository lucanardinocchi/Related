import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** When true, renders an inline spinner and disables the button. */
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-fg text-fg-on-accent hover:bg-[#1f1d18] focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
  secondary:
    "bg-surface text-fg hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
  ghost:
    "bg-transparent text-fg hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
  danger:
    "bg-danger text-fg-on-accent hover:bg-[#9b1717] focus-visible:outline focus-visible:outline-2 focus-visible:outline-danger",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-7 px-2 text-[13px] gap-1.5",
  md: "h-8 px-3 text-[14px] gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "md",
      leading,
      trailing,
      loading = false,
      disabled,
      className,
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...rest}
      >
        {loading ? (
          <span
            aria-hidden
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : (
          leading
        )}
        {children}
        {trailing}
      </button>
    );
  },
);
