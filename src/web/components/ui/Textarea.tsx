import { forwardRef, type TextareaHTMLAttributes } from "react";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", rows = 4, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={
        "w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-fg focus:ring-1 focus:ring-fg " +
        className
      }
      {...rest}
    />
  );
});
