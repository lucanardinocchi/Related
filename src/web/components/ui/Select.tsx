import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <div className="relative inline-block w-full">
      <select
        ref={ref}
        className={cn(
          "h-8 w-full appearance-none rounded-md border border-border bg-bg pl-2.5 pr-8 text-[14px] leading-[22px] text-fg hover:border-border-strong focus-visible:border-accent focus-visible:outline-none",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted"
      />
    </div>
  );
});
