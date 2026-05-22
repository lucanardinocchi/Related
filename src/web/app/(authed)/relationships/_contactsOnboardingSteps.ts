export type ContactsOnboardingStepId =
  | "first"
  | "second"
  | "family"
  | "third"
  | "fourth"
  | "fifth";

export interface ContactsOnboardingStep {
  id: ContactsOnboardingStepId;
  title: string;
  subtitle: string;
  body: string;
  /** Shown under the progress indicator. */
  progressLabel: string;
}

export const CONTACTS_ONBOARDING_STEPS: ContactsOnboardingStep[] = [
  {
    id: "first",
    title: "Your first person!",
    subtitle: "This is the fun one.",
    body:
      "Think of someone you genuinely love having in your life: a friend who makes you laugh, inspires you, or just feels like home. Add them here and Related starts working for you.",
    progressLabel: "Friend 1 of 5",
  },
  {
    id: "second",
    title: "Go a little deeper",
    subtitle: "Not the obvious pick.",
    body:
      "Nice. Now think harder. Who's someone important to you but easy to lose track of? The friend you mean to text back, the person who'd love to hear from you.",
    progressLabel: "Friend 2 of 5",
  },
  {
    id: "family",
    title: "Family members?",
    subtitle: "Totally optional.",
    body:
      "Want to add parents, siblings, or other family? You can skip this, or add them one at a time. As many as you want.",
    progressLabel: "Optional · Family",
  },
  {
    id: "third",
    title: "Keep going",
    subtitle: "You're on a roll.",
    body:
      "Three's the magic number for momentum. Who else belongs in your inner circle, someone you'd regret drifting from?",
    progressLabel: "Friend 3 of 5",
  },
  {
    id: "fourth",
    title: "You're almost there",
    subtitle: "Two more to go.",
    body:
      "Four people in. You're building something real. Who's the next person you'd want Related to nudge you about?",
    progressLabel: "Friend 4 of 5",
  },
  {
    id: "fifth",
    title: "About to cross the finish line",
    subtitle: "One last push.",
    body:
      "Five close friends is the sweet spot. Who rounds out your circle, the last person who deserves a spot here?",
    progressLabel: "Friend 5 of 5",
  },
];

export const FAMILY_ADD_DISCLAIMER =
  "Fair warning: family doesn't really count toward your inner circle, but we still need them in here so Related can keep track.";

export const FRIENDS_ONBOARDING_TARGET = 5;

export const ONBOARDING_STORAGE_KEYS = {
  friendsAdded: "relationships.contacts-onboarding.friends-added",
  familyComplete: "relationships.contacts-onboarding.family-complete",
  complete: "relationships.contacts-onboarding.complete",
} as const;

export function resolveContactsOnboardingStep(
  friendsAdded: number,
  familyComplete: boolean,
): ContactsOnboardingStep | null {
  if (friendsAdded >= FRIENDS_ONBOARDING_TARGET) return null;
  if (friendsAdded === 0) return CONTACTS_ONBOARDING_STEPS[0];
  if (friendsAdded === 1) return CONTACTS_ONBOARDING_STEPS[1];
  if (friendsAdded === 2 && !familyComplete) return CONTACTS_ONBOARDING_STEPS[2];
  if (friendsAdded === 2) return CONTACTS_ONBOARDING_STEPS[3];
  if (friendsAdded === 3) return CONTACTS_ONBOARDING_STEPS[4];
  if (friendsAdded === 4) return CONTACTS_ONBOARDING_STEPS[5];
  return null;
}
