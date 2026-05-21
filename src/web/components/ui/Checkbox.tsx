import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ className, ...rest }, ref) {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          "h-4 w-4 cursor-pointer rounded border-border-strong text-accent focus-visible:outline-2 focus-visible:outline-accent",
          className,
        )}
        {...rest}
      />
    );
  },
);
