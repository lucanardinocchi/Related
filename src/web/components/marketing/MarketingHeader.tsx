import Link from "next/link";
import { MarketingLinkButton } from "./MarketingLinkButton";

const NAV = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#integrations", label: "Integrations" },
  { href: "#pricing", label: "Pricing" },
];

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className="text-[15px] font-medium text-fg transition-colors hover:text-fg-muted"
        >
          Related
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-[13px] text-fg-muted transition-colors hover:text-fg"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <MarketingLinkButton href="/sign-in" variant="ghost" size="sm">
            Sign in
          </MarketingLinkButton>
          <MarketingLinkButton href="/sign-up" size="sm">
            Start free trial
          </MarketingLinkButton>
        </div>
      </div>
    </header>
  );
}
