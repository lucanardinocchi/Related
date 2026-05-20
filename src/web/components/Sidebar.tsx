"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/context", label: "Context" },
  { href: "/talk", label: "Talk to Claude" },
  { href: "/onboarding", label: "Setup" },
];

export function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-border bg-surface">
      <div className="px-6 py-6">
        <Link href="/context" className="text-lg font-semibold">
          Related
        </Link>
      </div>

      <nav className="flex-1 px-3">
        <ul className="space-y-1">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={
                    "block rounded-md px-3 py-2 text-sm transition-colors " +
                    (active
                      ? "bg-fg text-accent-fg"
                      : "text-fg hover:bg-border/40")
                  }
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border px-6 py-4">
        <div className="mb-2 truncate text-xs text-muted">{userEmail}</div>
        <form action="/auth/sign-out" method="post">
          <button
            type="submit"
            className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
