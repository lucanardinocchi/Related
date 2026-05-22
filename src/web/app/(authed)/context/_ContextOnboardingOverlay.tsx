"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { Modal } from "@/components/ui";
import type { IntegrationEnvConfig } from "@/lib/integrations/integrationConnect";
import { OnboardingWizard } from "../onboarding/_OnboardingWizard";

interface ConnectionSnapshot {
  calendar: boolean;
  outlook: boolean;
  gmail: boolean;
  instagram: boolean;
  x: boolean;
  whatsapp: boolean;
  tiktok: boolean;
}

interface Props extends ConnectionSnapshot, IntegrationEnvConfig {
  open: boolean;
  onClose: () => void;
}

const RETURN_PATH = "/context?onboarding=1";

export function ContextOnboardingOverlay({
  open,
  onClose,
  ...wizardProps
}: Props) {
  const router = useRouter();

  const handleFinished = useCallback(() => {
    onClose();
    router.refresh();
  }, [onClose, router]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Set up Related"
      size="xl"
      className="max-h-[min(90vh,960px)] overflow-y-auto [&_header>div:first-child]:sr-only"
    >
      <OnboardingWizard
        {...wizardProps}
        returnPath={RETURN_PATH}
        onFinished={handleFinished}
        embedded
      />
    </Modal>
  );
}
