"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button, Modal } from "@/components/ui";

export function ContextOnboardingLauncher() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const open = searchParams.get("onboarding") === "1";

  const close = useCallback(() => {
    router.push("/context", { scroll: false });
  }, [router]);

  const toggle = useCallback(() => {
    if (open) {
      close();
      return;
    }
    router.push("/context?onboarding=1", { scroll: false });
  }, [open, close, router]);

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-label="Set up Related"
        aria-expanded={open}
        className={cn(
          "fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-border bg-bg px-4 py-2.5",
          "text-[14px] font-medium text-fg shadow-[var(--shadow-2)]",
          "transition-colors hover:border-border-strong hover:bg-surface",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
        )}
      >
        <Sparkles size={16} className="text-fg-muted" aria-hidden />
        <span>Set up Related</span>
      </button>

      <Modal
        open={open}
        onClose={close}
        title="Set up Related"
        subtitle="Connect accounts and finish your setup."
        footer={
          <Button variant="ghost" onClick={close}>
            Close
          </Button>
        }
      >
        <p className="text-[14px] text-fg-muted">
          Onboarding setup will appear here.
        </p>
      </Modal>
    </>
  );
}
