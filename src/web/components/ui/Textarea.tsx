import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(
          "w-full rounded-md border border-border bg-bg px-2.5 py-2 text-[14px] leading-[22px] text-fg placeholder:text-fg-subtle hover:border-border-strong focus-visible:border-accent focus-visible:outline-none",
          className,
        )}
        {...rest}
      />
    );
  },
);
