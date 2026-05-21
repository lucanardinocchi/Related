"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calendar as CalendarIcon,
  CircleCheck,
  LogOut,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { usePersistedBoolean } from "@/lib/usePersistedBoolean";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Users;
  /** Whether `pathname.startsWith(href)` should match (default) or === only. */
  exact?: boolean;
}

const PRIMARY: NavItem[] = [
  { href: "/relationships", label: "Relationships", icon: Users },
  { href: "/calendar", label: "Calendar", icon: CalendarIcon },
  { href: "/commitments", label: "Commitments", icon: CircleCheck },
  { href: "/agent", label: "Agent", icon: MessageSquareText },
];

const SETTINGS: NavItem[] = [
  { href: "/context", label: "Context", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

const COLLAPSED_KEY = "related.sidebar.collapsed";

function isActive(href: string, pathname: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  pathname,
  collapsed,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
}) {
  const active = isActive(item.href, pathname, item.exact);
  const Icon = item.icon;
  return (
    <li>
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        aria-label={item.label}
        className={cn(
          "flex items-center gap-2 rounded-md text-[14px] leading-[20px] transition-colors",
          collapsed ? "justify-center px-0 py-2" : "px-2 py-1.5",
          active
            ? "bg-active text-fg font-medium"
            : "text-fg-muted hover:bg-hover hover:text-fg",
        )}
      >
        <Icon
          size={16}
          className={cn(
            "flex-none",
            active ? "text-fg" : "text-fg-subtle",
          )}
        />
        {collapsed ? null : <span>{item.label}</span>}
      </Link>
    </li>
  );
}

export function Sidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  const [collapsed, toggleCollapsed] = usePersistedBoolean(COLLAPSED_KEY);

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "flex h-screen shrink-0 flex-col border-r border-border bg-surface",
        "transition-[width] duration-150 ease-out motion-reduce:transition-none",
        collapsed ? "w-14" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex pt-5 pb-3",
          collapsed
            ? "flex-col items-center gap-2 px-1"
            : "items-center justify-between px-4",
        )}
      >
        {collapsed ? (
          <Link
            href="/relationships"
            title="Related"
            aria-label="Related"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-[13px] font-semibold text-fg hover:bg-hover"
          >
            R
          </Link>
        ) : (
          <Link
            href="/relationships"
            className="inline-flex items-center gap-2 rounded px-1.5 py-1 text-[15px] font-medium text-fg hover:bg-hover"
          >
            Related
          </Link>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-fg-subtle hover:bg-hover hover:text-fg"
        >
          {collapsed ? (
            <PanelLeftOpen size={16} />
          ) : (
            <PanelLeftClose size={16} />
          )}
        </button>
      </div>

      <nav
        className={cn(
          "flex-1 overflow-y-auto pb-2",
          collapsed ? "px-1" : "px-2",
        )}
      >
        <ul className="space-y-0.5">
          {PRIMARY.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
            />
          ))}
        </ul>

        {collapsed ? (
          <div className="my-3 mx-2 h-px bg-divider" aria-hidden />
        ) : (
          <div className="mt-6 mb-1.5 px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
            Settings
          </div>
        )}
        <ul className="space-y-0.5">
          {SETTINGS.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              collapsed={collapsed}
            />
          ))}
        </ul>
      </nav>

      <div
        className={cn(
          "py-3",
          collapsed ? "flex justify-center px-1" : "px-4",
        )}
      >
        {collapsed ? (
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              aria-label="Sign out"
              title={`Sign out (${userEmail})`}
              className="inline-flex h-8 w-8 items-center justify-center rounded text-fg-subtle hover:bg-hover hover:text-fg"
            >
              <LogOut size={16} />
            </button>
          </form>
        ) : (
          <>
            <div className="mb-1.5 truncate text-[12px] text-fg-subtle">
              {userEmail}
            </div>
            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                className="text-[13px] text-fg-muted underline-offset-4 hover:text-fg hover:underline"
              >
                Sign out
              </button>
            </form>
          </>
        )}
      </div>
    </aside>
  );
}
