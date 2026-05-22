export type OnboardingWizardStepId =
  | "welcome"
  | "calendars"
  | "email"
  | "messaging"
  | "review";

export interface OnboardingWizardStep {
  id: OnboardingWizardStepId;
  label: string;
  title: string;
  body: string;
  /** Shown in the checklist — every step is skippable. */
  optional: boolean;
}

export const ONBOARDING_WIZARD_STEPS: OnboardingWizardStep[] = [
  {
    id: "welcome",
    label: "Welcome",
    title: "Welcome to Related",
    body:
      "Related helps you stay close to the people you care about. This setup walks you through connecting the accounts Related can read from. Every step is optional — connect what you use, skip the rest, and add more later in Settings.",
    optional: false,
  },
  {
    id: "calendars",
    label: "Calendars",
    title: "Connect a calendar",
    body:
      "Read-only calendar access lets Related gauge your week's density for catch-up timing. Connect Google Calendar, Outlook, both, or neither.",
    optional: true,
  },
  {
    id: "email",
    label: "Email",
    title: "Connect email",
    body:
      "Gmail lets you read and send email with contacts from their relationship pages. Skip if you prefer to handle email elsewhere.",
    optional: true,
  },
  {
    id: "messaging",
    label: "Messaging",
    title: "Connect messaging",
    body:
      "Link the channels you use for DMs so Related can surface conversations on relationship pages. Instagram and X are available now; WhatsApp and TikTok are coming soon.",
    optional: true,
  },
  {
    id: "review",
    label: "Review",
    title: "You're ready",
    body:
      "Here's what you connected. You can change integrations any time from Settings.",
    optional: false,
  },
];

export function stepIndex(id: OnboardingWizardStepId): number {
  return ONBOARDING_WIZARD_STEPS.findIndex((s) => s.id === id);
}
