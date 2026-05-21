"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

interface Props {
  userEmail: string;
  children: React.ReactNode;
}

export function AuthedLayoutShell({ userEmail, children }: Props) {
  const pathname = usePathname();
  const isOnboarding = pathname === "/onboarding";

  if (isOnboarding) {
    return (
      <div className="min-h-screen overflow-y-auto bg-bg">
        <div className="mx-auto w-full max-w-[var(--layout-content-max-w)] px-6 py-10 sm:px-10 sm:py-12">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar userEmail={userEmail} />
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[var(--layout-content-max-w)] px-10 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
