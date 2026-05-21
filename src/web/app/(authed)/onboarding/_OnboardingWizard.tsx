"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Calendar,
  Mail,
  AtSign,
  MessageCircle,
  Check,
} from "lucide-react";
import { Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getBrowserDeps } from "@/lib/deps/client";
import {
  type IntegrationEnvConfig,
  type IntegrationWorking,
  captureGoogleProviderTokens,
  connectGoogleCalendar,
  connectGoogleGmail,
  connectOutlookCalendar,
  connectInstagram,
  connectX,
  connectWhatsApp,
  connectTikTok,
  refreshGoogleConnections,
  refreshOutlookConnection,
  refreshInstagramConnection,
  refreshXConnection,
  refreshWhatsAppConnection,
  refreshTikTokConnection,
} from "@/lib/integrations/integrationConnect";
import { setOAuthReturnPath } from "@/lib/integrations/oauthReturn";
import { OnboardingStepChecklist } from "./_OnboardingStepChecklist";
import {
  ONBOARDING_WIZARD_STEPS,
  stepIndex,
  type OnboardingWizardStepId,
} from "./onboardingSteps";

const RETURN_PATH = "/onboarding";

interface ConnectionSnapshot {
  calendar: boolean;
  outlook: boolean;
  gmail: boolean;
  instagram: boolean;
  x: boolean;
  whatsapp: boolean;
  tiktok: boolean;
}

interface Props extends ConnectionSnapshot, IntegrationEnvConfig {}

export function OnboardingWizard({
  calendar: initialCalendar,
  outlook: initialOutlook,
  gmail: initialGmail,
  instagram: initialInstagram,
  x: initialX,
  whatsapp: initialWhatsapp,
  tiktok: initialTiktok,
  instagramAppId,
  xClientId,
  whatsappAppId,
  tiktokClientKey,
  microsoftClientId,
}: Props) {
  const router = useRouter();
  const [currentStepId, setCurrentStepId] =
    useState<OnboardingWizardStepId>("welcome");
  const [completedStepIds, setCompletedStepIds] = useState<
    OnboardingWizardStepId[]
  >([]);
  const [calendarConnected, setCalendarConnected] = useState(initialCalendar);
  const [outlookConnected, setOutlookConnected] = useState(initialOutlook);
  const [gmailConnected, setGmailConnected] = useState(initialGmail);
  const [instagramConnected, setInstagramConnected] =
    useState(initialInstagram);
  const [xConnected, setXConnected] = useState(initialX);
  const [whatsappConnected, setWhatsappConnected] = useState(initialWhatsapp);
  const [tiktokConnected, setTiktokConnected] = useState(initialTiktok);
  const [working, setWorking] = useState<IntegrationWorking>(null);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captureRunning = useRef(false);

  const currentStep =
    ONBOARDING_WIZARD_STEPS[stepIndex(currentStepId)] ??
    ONBOARDING_WIZARD_STEPS[0];
  const stepNumber = stepIndex(currentStepId) + 1;
  const totalSteps = ONBOARDING_WIZARD_STEPS.length;

  const refreshAll = useCallback(async () => {
    const [google, outlook, instagram, x, whatsapp, tiktok] =
      await Promise.all([
        refreshGoogleConnections(),
        refreshOutlookConnection(),
        refreshInstagramConnection(),
        refreshXConnection(),
        refreshWhatsAppConnection(),
        refreshTikTokConnection(),
      ]);
    setCalendarConnected(google.calendar);
    setGmailConnected(google.gmail);
    setOutlookConnected(outlook);
    setInstagramConnected(instagram);
    setXConnected(x);
    setWhatsappConnected(whatsapp);
    setTiktokConnected(tiktok);
  }, []);

  const captureProviderTokens = useCallback(async () => {
    if (captureRunning.current) return;
    captureRunning.current = true;
    try {
      const result = await captureGoogleProviderTokens(RETURN_PATH);
      if (result) {
        setCalendarConnected(result.calendar);
        setGmailConnected(result.gmail);
      }
      setWorking(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to save Google connection",
      );
      setWorking(null);
    } finally {
      captureRunning.current = false;
    }
  }, []);

  useEffect(() => {
    setOAuthReturnPath(RETURN_PATH);
    let cancelled = false;
    (async () => {
      const { onboarding } = getBrowserDeps();
      await onboarding.startIfNeeded();
      if (cancelled) return;
      await captureProviderTokens();
      if (cancelled) return;
      await refreshAll();
    })();
    const { auth } = getBrowserDeps();
    const unsubscribe = auth.onAuthStateChange(() => {
      void captureProviderTokens();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [captureProviderTokens, refreshAll]);

  function markStepComplete(stepId: OnboardingWizardStepId) {
    setCompletedStepIds((prev) =>
      prev.includes(stepId) ? prev : [...prev, stepId],
    );
  }

  function goToNextStep() {
    markStepComplete(currentStepId);
    const nextIndex = stepIndex(currentStepId) + 1;
    if (nextIndex < ONBOARDING_WIZARD_STEPS.length) {
      setCurrentStepId(ONBOARDING_WIZARD_STEPS[nextIndex]!.id);
      setError(null);
    }
  }

  function goToPreviousStep() {
    const prevIndex = stepIndex(currentStepId) - 1;
    if (prevIndex >= 0) {
      setCurrentStepId(ONBOARDING_WIZARD_STEPS[prevIndex]!.id);
      setError(null);
    }
  }

  async function runConnect(
    key: NonNullable<IntegrationWorking>,
    fn: () => Promise<void>,
  ) {
    if (working) return;
    setError(null);
    setWorking(key);
    try {
      await fn();
    } catch (e) {
      setWorking(null);
      setError(e instanceof Error ? e.message : "Failed to start OAuth");
    }
  }

  async function finishSetup() {
    if (finishing) return;
    setFinishing(true);
    setError(null);
    try {
      const { onboarding } = getBrowserDeps();
      await onboarding.finishOnboarding();
      router.replace("/relationships");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not finish setup");
      setFinishing(false);
    }
  }

  const connections: ConnectionSnapshot = {
    calendar: calendarConnected,
    outlook: outlookConnected,
    gmail: gmailConnected,
    instagram: instagramConnected,
    x: xConnected,
    whatsapp: whatsappConnected,
    tiktok: tiktokConnected,
  };

  const connectedCount = Object.values(connections).filter(Boolean).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 lg:flex-row lg:gap-12">
      <aside className="lg:w-56 lg:shrink-0">
        <OnboardingStepChecklist
          currentStepId={currentStepId}
          completedStepIds={completedStepIds}
        />
      </aside>

      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
          Step {stepNumber} of {totalSteps}
        </p>
        <h1 className="mt-2 text-[24px] font-semibold tracking-tight text-fg">
          {currentStep.title}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
          {currentStep.body}
        </p>

        <div className="mt-6 space-y-3">
          {currentStepId === "calendars" ? (
            <>
              <IntegrationCard
                icon={<Calendar size={18} className="text-fg-subtle" />}
                title="Google Calendar"
                description="Read-only access for week-density signals."
                connected={calendarConnected}
                connectLabel="Connect Google Calendar"
                loading={working === "calendar"}
                disabled={working !== null}
                onConnect={() =>
                  void runConnect("calendar", () =>
                    connectGoogleCalendar(RETURN_PATH),
                  )
                }
              />
              <IntegrationCard
                icon={<Calendar size={18} className="text-fg-subtle" />}
                title="Outlook Calendar"
                description="Same week-density signal for Outlook users."
                connected={outlookConnected}
                connectLabel="Connect Outlook Calendar"
                loading={working === "outlook"}
                disabled={working !== null || !microsoftClientId}
                unavailableNote={
                  !microsoftClientId
                    ? "Outlook is not configured in this environment."
                    : undefined
                }
                onConnect={() =>
                  void runConnect("outlook", () =>
                    connectOutlookCalendar(RETURN_PATH, microsoftClientId!),
                  )
                }
              />
            </>
          ) : null}

          {currentStepId === "email" ? (
            <IntegrationCard
              icon={<Mail size={18} className="text-fg-subtle" />}
              title="Gmail"
              description="Read and send email from relationship pages."
              connected={gmailConnected}
              connectLabel="Connect Gmail"
              loading={working === "gmail"}
              disabled={working !== null}
              onConnect={() =>
                void runConnect("gmail", () => connectGoogleGmail(RETURN_PATH))
              }
            />
          ) : null}

          {currentStepId === "messaging" ? (
            <>
              <IntegrationCard
                icon={<AtSign size={18} className="text-fg-subtle" />}
                title="Instagram"
                description="DMs from creator/professional accounts."
                connected={instagramConnected}
                connectLabel="Connect Instagram"
                loading={working === "instagram"}
                disabled={working !== null || !instagramAppId}
                unavailableNote={
                  !instagramAppId
                    ? "Instagram is not configured in this environment."
                    : undefined
                }
                onConnect={() =>
                  void runConnect("instagram", () =>
                    connectInstagram(RETURN_PATH, instagramAppId!),
                  )
                }
              />
              <IntegrationCard
                icon={
                  <span className="text-[18px] leading-none text-fg-subtle">
                    𝕏
                  </span>
                }
                title="X"
                description="Read and send DMs from relationship pages."
                connected={xConnected}
                connectLabel="Connect X"
                loading={working === "x"}
                disabled={working !== null || !xClientId}
                unavailableNote={
                  !xClientId
                    ? "X is not configured in this environment."
                    : undefined
                }
                onConnect={() =>
                  void runConnect("x", () => connectX(RETURN_PATH, xClientId!))
                }
              />
              <IntegrationCard
                icon={<MessageCircle size={18} className="text-fg-subtle" />}
                title="WhatsApp"
                description="Business Cloud API messaging on relationship pages."
                connected={whatsappConnected}
                connectLabel="Connect WhatsApp"
                loading={working === "whatsapp"}
                disabled={working !== null || !whatsappAppId}
                unavailableNote={
                  !whatsappAppId
                    ? "WhatsApp is not configured in this environment."
                    : undefined
                }
                onConnect={() =>
                  void runConnect("whatsapp", () =>
                    connectWhatsApp(RETURN_PATH, whatsappAppId!),
                  )
                }
              />
              <IntegrationCard
                icon={
                  <span className="text-[18px] leading-none text-fg-subtle">
                    ♪
                  </span>
                }
                title="TikTok"
                description="Business messaging from relationship pages."
                connected={tiktokConnected}
                connectLabel="Connect TikTok"
                loading={working === "tiktok"}
                disabled={working !== null || !tiktokClientKey}
                unavailableNote={
                  !tiktokClientKey
                    ? "TikTok is not configured in this environment."
                    : undefined
                }
                onConnect={() =>
                  void runConnect("tiktok", () =>
                    connectTikTok(RETURN_PATH, tiktokClientKey!),
                  )
                }
              />
            </>
          ) : null}

          {currentStepId === "review" ? (
            <Card>
              <p className="text-[14px] font-medium text-fg">
                {connectedCount === 0
                  ? "No accounts connected yet"
                  : `${connectedCount} account${connectedCount === 1 ? "" : "s"} connected`}
              </p>
              <ul className="mt-3 space-y-2 text-[13px] text-fg-muted">
                <ReviewRow label="Google Calendar" connected={calendarConnected} />
                <ReviewRow label="Outlook Calendar" connected={outlookConnected} />
                <ReviewRow label="Gmail" connected={gmailConnected} />
                <ReviewRow label="Instagram" connected={instagramConnected} />
                <ReviewRow label="X" connected={xConnected} />
                <ReviewRow label="WhatsApp" connected={whatsappConnected} />
                <ReviewRow label="TikTok" connected={tiktokConnected} />
              </ul>
              <p className="mt-4 text-[13px] text-fg-subtle">
                You can connect or disconnect any of these later in Settings.
              </p>
            </Card>
          ) : null}
        </div>

        {error ? (
          <p className="mt-4 text-[13px] text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-3">
          {stepIndex(currentStepId) > 0 ? (
            <Button variant="ghost" size="md" onClick={goToPreviousStep}>
              Back
            </Button>
          ) : null}

          {currentStepId === "review" ? (
            <Button
              variant="primary"
              size="md"
              loading={finishing}
              onClick={() => void finishSetup()}
            >
              Enter Related
            </Button>
          ) : (
            <>
              <Button variant="primary" size="md" onClick={goToNextStep}>
                {currentStepId === "welcome" ? "Get started" : "Continue"}
              </Button>
              {currentStep.optional ? (
                <Button variant="ghost" size="md" onClick={goToNextStep}>
                  Skip this step
                </Button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({
  icon,
  title,
  description,
  connected,
  connectLabel,
  loading,
  disabled,
  unavailableNote,
  onConnect,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  connected: boolean;
  connectLabel: string;
  loading: boolean;
  disabled: boolean;
  unavailableNote?: string;
  onConnect: () => void;
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-[14px] font-medium text-fg">{title}</p>
            <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p>
          </div>
          {connected ? (
            <p className="flex items-center gap-1 text-[13px] text-success">
              <Check size={14} aria-hidden />
              Connected
            </p>
          ) : unavailableNote ? (
            <p className="text-[13px] text-fg-muted">{unavailableNote}</p>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              loading={loading}
              disabled={disabled}
              onClick={onConnect}
            >
              {connectLabel}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function ReviewRow({
  label,
  connected,
}: {
  label: string;
  connected: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-4">
      <span>{label}</span>
      <span
        className={cn(
          "shrink-0",
          connected ? "text-success" : "text-fg-subtle",
        )}
      >
        {connected ? "Connected" : "Not connected"}
      </span>
    </li>
  );
}
