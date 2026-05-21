import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-8 w-full rounded-md border border-border bg-bg px-2.5 text-[14px] leading-[22px] text-fg placeholder:text-fg-subtle hover:border-border-strong focus-visible:border-accent focus-visible:outline-none",
        className,
      )}
      {...rest}
    />
  );
});
