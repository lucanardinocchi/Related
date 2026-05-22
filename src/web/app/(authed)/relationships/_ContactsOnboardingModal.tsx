"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, PartyPopper, Brain, Users, Flame, Flag } from "lucide-react";
import { getBrowserDeps } from "@/lib/deps/client";
import { usePersistedBoolean } from "@/lib/usePersistedBoolean";
import { usePersistedNumber } from "@/lib/usePersistedNumber";
import { FormField } from "@/components/ui/FormField";
import { Badge, Body, Button, Input, Modal } from "@/components/ui";
import {
  CONTACTS_ONBOARDING_STEPS,
  FAMILY_ADD_DISCLAIMER,
  FRIENDS_ONBOARDING_TARGET,
  ONBOARDING_STORAGE_KEYS,
  resolveContactsOnboardingStep,
  type ContactsOnboardingStep,
} from "./_contactsOnboardingSteps";

interface Props {
  contactCount: number;
}

type FamilyPhase = "prompt" | "add";

const STEP_ICONS: Record<
  ContactsOnboardingStep["id"],
  typeof Sparkles
> = {
  first: PartyPopper,
  second: Brain,
  family: Users,
  third: Flame,
  fourth: Sparkles,
  fifth: Flag,
};

export function ContactsOnboardingModal({ contactCount }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const newRelationshipOpen = searchParams.get("new") === "1";

  const [complete, toggleComplete] = usePersistedBoolean(
    ONBOARDING_STORAGE_KEYS.complete,
  );
  const [friendsAdded, setFriendsAdded] = usePersistedNumber(
    ONBOARDING_STORAGE_KEYS.friendsAdded,
  );
  const [familyComplete, toggleFamilyComplete] = usePersistedBoolean(
    ONBOARDING_STORAGE_KEYS.familyComplete,
  );

  const markComplete = useCallback(() => {
    if (!complete) toggleComplete();
  }, [complete, toggleComplete]);

  const markFamilyComplete = useCallback(() => {
    if (!familyComplete) toggleFamilyComplete();
  }, [familyComplete, toggleFamilyComplete]);

  const [dismissed, setDismissed] = useState(false);
  const prevContactCount = useRef(contactCount);
  const [familyPhase, setFamilyPhase] = useState<FamilyPhase>("prompt");
  const [familyAddedCount, setFamilyAddedCount] = useState(0);
  const [lastFamilyAddedName, setLastFamilyAddedName] = useState<string | null>(
    null,
  );
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = useMemo(
    () => resolveContactsOnboardingStep(friendsAdded, familyComplete),
    [friendsAdded, familyComplete],
  );

  useEffect(() => {
    if (complete) return;
    if (contactCount >= FRIENDS_ONBOARDING_TARGET) {
      setFriendsAdded(FRIENDS_ONBOARDING_TARGET);
      markComplete();
    }
  }, [complete, contactCount, setFriendsAdded, markComplete]);

  useEffect(() => {
    if (!step) return;
    if (step.id !== "family") {
      setFamilyPhase("prompt");
      setFamilyAddedCount(0);
      setLastFamilyAddedName(null);
    }
    setName("");
    setPhone("");
    setEmail("");
    setError(null);
  }, [step?.id]);

  const shouldAutoOpen =
    !complete &&
    step != null &&
    friendsAdded < FRIENDS_ONBOARDING_TARGET &&
    !newRelationshipOpen &&
    !dismissed;

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (contactCount > prevContactCount.current && step && !complete) {
      setDismissed(false);
      setOpen(true);
    }
    prevContactCount.current = contactCount;
  }, [contactCount, step, complete]);

  useEffect(() => {
    if (shouldAutoOpen) {
      setOpen(true);
    }
  }, [shouldAutoOpen, step?.id]);

  const close = useCallback(() => {
    setOpen(false);
    setDismissed(true);
  }, []);

  const advanceAfterFriend = useCallback(() => {
    const next = Math.min(friendsAdded + 1, FRIENDS_ONBOARDING_TARGET);
    setFriendsAdded(next);
    if (next >= FRIENDS_ONBOARDING_TARGET) {
      markComplete();
      setOpen(false);
    }
    router.refresh();
  }, [friendsAdded, setFriendsAdded, markComplete, router]);

  const skipFamily = useCallback(() => {
    markFamilyComplete();
    setFamilyPhase("prompt");
    router.refresh();
  }, [markFamilyComplete, router]);

  const finishFamily = useCallback(() => {
    markFamilyComplete();
    setFamilyPhase("prompt");
    router.refresh();
  }, [markFamilyComplete, router]);

  async function submitContact(options: { countsAsFriend: boolean }) {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const deps = getBrowserDeps();
      const trimmedName = name.trim();
      await deps.relationships.createContact({
        name: trimmedName,
        phone: phone.trim() || null,
        email: email.trim() || null,
        birthday: null,
        area: null,
        latitude: null,
        longitude: null,
        occupation: null,
        education: null,
      });

      setName("");
      setPhone("");
      setEmail("");

      if (options.countsAsFriend) {
        advanceAfterFriend();
      } else {
        setFamilyAddedCount((count) => count + 1);
        setLastFamilyAddedName(trimmedName);
        router.refresh();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create contact.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!step || complete) return null;

  const StepIcon = STEP_ICONS[step.id];
  const stepIndex = CONTACTS_ONBOARDING_STEPS.findIndex((s) => s.id === step.id);
  const isFamily = step.id === "family";

  const footer = isFamily ? (
    familyPhase === "prompt" ? (
      <>
        <Button variant="ghost" onClick={close} disabled={submitting}>
          Not now
        </Button>
        <Button variant="ghost" onClick={skipFamily} disabled={submitting}>
          Skip family
        </Button>
        <Button
          variant="primary"
          onClick={() => setFamilyPhase("add")}
          disabled={submitting}
        >
          Yes, add family
        </Button>
      </>
    ) : (
      <>
        <Button variant="ghost" onClick={finishFamily} disabled={submitting}>
          Continue to friends
        </Button>
        <Button
          variant="primary"
          onClick={() => void submitContact({ countsAsFriend: false })}
          loading={submitting}
          disabled={!name.trim()}
        >
          {familyAddedCount > 0 ? "Add another family member" : "Add family member"}
        </Button>
      </>
    )
  ) : (
    <>
      <Button variant="ghost" onClick={close} disabled={submitting}>
        Later
      </Button>
      <Button
        variant="primary"
        onClick={() => void submitContact({ countsAsFriend: true })}
        loading={submitting}
        disabled={!name.trim()}
      >
        Add {step.id === "first" ? "my first friend" : "contact"}
      </Button>
    </>
  );

  return (
    <Modal
      open={open}
      onClose={close}
      title={step.title}
      subtitle={step.subtitle}
      footer={footer}
      size="md"
      className="flex max-h-[min(85vh,720px)] flex-col"
    >
      <div className="-mx-5 max-h-[min(52vh,480px)] overflow-y-auto px-5">
        <div className="mb-5 flex items-center gap-3 rounded-lg border border-divider bg-surface/50 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/10">
            <StepIcon size={18} className="text-accent" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-medium uppercase tracking-wide text-fg-muted">
              {step.progressLabel}
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-divider">
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{
                  width: `${((stepIndex + 1) / CONTACTS_ONBOARDING_STEPS.length) * 100}%`,
                }}
              />
            </div>
          </div>
        </div>

        <Body className="text-fg">{step.body}</Body>

        {isFamily && familyPhase === "add" && (
          <>
            <p className="mt-4 rounded-md border border-divider bg-surface px-3 py-2.5 text-[13px] leading-[20px] text-fg-muted">
              {FAMILY_ADD_DISCLAIMER}
            </p>
            {lastFamilyAddedName && (
              <p className="mt-3 text-[13px] text-fg-muted">
                Added {lastFamilyAddedName}. Add another, or continue when you are
                done.
              </p>
            )}
          </>
        )}

        {(!isFamily || familyPhase === "add") && (
          <div className="mt-5 space-y-4">
            <FormField label="Name" htmlFor="onboarding-contact-name">
              <Input
                id="onboarding-contact-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={isFamily ? "e.g. Mum, Dad, Alex" : "Full name"}
                autoFocus
              />
            </FormField>
            <FormField
              label="Phone"
              htmlFor="onboarding-contact-phone"
              hint="Optional"
            >
              <Input
                id="onboarding-contact-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+61 …"
                type="tel"
              />
            </FormField>
            <FormField
              label="Email"
              htmlFor="onboarding-contact-email"
              hint="Optional"
            >
              <Input
                id="onboarding-contact-email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                type="email"
                autoCapitalize="none"
              />
            </FormField>
          </div>
        )}

        {error && (
          <div className="mt-4">
            <Badge tone="danger">{error}</Badge>
          </div>
        )}
      </div>
    </Modal>
  );
}
