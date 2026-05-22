"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { AppleIcon, GoogleIcon } from "./providerIcons";

export type ProviderSignInKind = "google" | "apple";
export type ProviderAuthAction = "sign-in" | "sign-up";

export interface ProviderSignInButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  provider: ProviderSignInKind;
  action?: ProviderAuthAction;
  loading?: boolean;
}

function providerLabel(
  provider: ProviderSignInKind,
  action: ProviderAuthAction,
): string {
  const verb = action === "sign-up" ? "Sign up" : "Sign in";
  return provider === "google"
    ? `${verb} with Google`
    : `${verb} with Apple`;
}

const providerStyles: Record<
  ProviderSignInKind,
  {
    className: string;
    Icon: typeof GoogleIcon;
  }
> = {
  google: {
    className:
      "border border-[#747775] bg-white text-[#1f1f1f] hover:bg-[#f8f9fa] active:bg-[#f1f3f4]",
    Icon: GoogleIcon,
  },
  apple: {
    className: "border border-black bg-black text-white hover:bg-[#1a1a1a]",
    Icon: AppleIcon,
  },
};

export const ProviderSignInButton = forwardRef<
  HTMLButtonElement,
  ProviderSignInButtonProps
>(function ProviderSignInButton(
  { provider, action = "sign-in", loading = false, disabled, className, ...rest },
  ref,
) {
  const label = providerLabel(provider, action);
  const { className: providerClass, Icon } = providerStyles[provider];

  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      aria-label={label}
      className={cn(
        "inline-flex h-11 w-full items-center justify-center gap-3 rounded-md px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        providerClass,
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className={cn(
            "inline-block h-5 w-5 animate-spin rounded-full border-2 border-t-transparent",
            provider === "apple"
              ? "border-white/40 border-t-white"
              : "border-[#1f1f1f]/30 border-t-[#1f1f1f]",
          )}
        />
      ) : (
        <Icon className="shrink-0" />
      )}
      <span>{label}</span>
    </button>
  );
});
