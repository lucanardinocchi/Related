import Link from "next/link";
import { Small } from "@/components/ui/Typography";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/" className="text-[15px] font-medium text-fg">
            Related
          </Link>
          <Small as="p" className="mt-1 max-w-sm">
            Ambient relationship intelligence for people who want to stay close
            to the ones they care about.
          </Small>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Link
            href="/sign-up"
            className="text-[13px] text-fg-muted hover:text-fg"
          >
            Get started
          </Link>
          <Link
            href="/sign-in"
            className="text-[13px] text-fg-muted hover:text-fg"
          >
            Sign in
          </Link>
        </div>
      </div>

      <div className="border-t border-border px-6 py-4">
        <Small className="mx-auto block max-w-6xl text-center sm:text-left">
          © {new Date().getFullYear()} Related. Not a CRM. A personal
          relationship companion.
        </Small>
      </div>
    </footer>
  );
}
