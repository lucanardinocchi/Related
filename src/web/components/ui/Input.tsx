import { forwardRef, type InputHTMLAttributes } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={
          "w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-fg focus:ring-1 focus:ring-fg " +
          className
        }
        {...rest}
      />
    );
  },
);
