"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Calendar,
  Handshake,
  Mail,
  MessageCircle,
  MessageSquare,
  NotebookPen,
  Phone,
} from "lucide-react";
import type {
  InteractionCategory,
  InteractionStatus,
} from "@related/shared";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";
import { FormField } from "@/components/ui/FormField";
import {
  fromLocalDtInput,
  toLocalDtInput,
} from "./_dateFormat";
import {
  COMMS_CHANNEL_META,
  COMMS_KINDS,
  type CommitmentTiming,
  type CommsKind,
  type ContextFamily,
  defaultStatusForCommitmentTiming,
  defaultStatusForInteractionTiming,
  FAMILY_META,
  type InteractionTiming,
} from "./_contextTypes";

type Step = "family" | "configure" | "capture";

const STEP_NUMBER: Record<Step, number> = {
  family: 1,
  configure: 2,
  capture: 3,
};

const INTERACTION_CATEGORIES: InteractionCategory[] = [
  "personal",
  "meeting",
  "activity",
  "work",
  "errands",
];

const COMMITMENT_OPTIONS: {
  value: CommitmentTiming;
  label: string;
  description: string;
}[] = [
  {
    value: "planned",
    label: "Planned",
    description: "Still open — shows in commitments",
  },
  {
    value: "completed",
    label: "Completed",
    description: "You did it — logged in the past",
  },
  {
    value: "missed",
    label: "Missed",
    description: "Didn't happen — logged in the past",
  },
];

const CHANNEL_ICONS: Record<CommsKind, ReactNode> = {
  instagram_dm: <MessageCircle size={18} />,
  x_dm: <MessageSquare size={18} />,
  whatsapp: <MessageCircle size={18} />,
  tiktok_dm: <MessageCircle size={18} />,
  imessage: <MessageSquare size={18} />,
  email: <Mail size={18} />,
  phone_call: <Phone size={18} />,
};

const FAMILY_ICONS: Record<ContextFamily, ReactNode> = {
  interaction: <Calendar size={20} />,
  note: <NotebookPen size={20} />,
  comms: <MessageCircle size={20} />,
  commitment: <Handshake size={20} />,
};

export interface AddContextResult {
  family: ContextFamily;
  time: string;
  notes: string | null;
  /** Interaction payload when family is interaction, note, or comms. */
  interaction?: {
    kind: string;
    category: InteractionCategory;
    status: InteractionStatus;
  };
  /** Commitment payload when family is commitment. */
  commitment?: {
    description: string;
    timing: CommitmentTiming;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (result: AddContextResult) => Promise<void>;
}

function stepTitle(step: Step, family: ContextFamily | null): string {
  if (step === "family") return "Add context";
  if (step === "configure") {
    if (!family) return "Add context";
    return FAMILY_META[family].label;
  }
  return "When & details";
}

function stepSubtitle(step: Step, family: ContextFamily | null): string {
  if (step === "family") {
    return "What kind of context are you capturing?";
  }
  if (step === "configure" && family) {
    return FAMILY_META[family].description;
  }
  return "Time and anything you want the agent to remember.";
}

export function AddContextModal({ open, onClose, onSubmit }: Props) {
  const [step, setStep] = useState<Step>("family");
  const [family, setFamily] = useState<ContextFamily | null>(null);
  const [interactionTiming, setInteractionTiming] =
    useState<InteractionTiming>("past");
  const [category, setCategory] = useState<InteractionCategory>("personal");
  const [eventKind, setEventKind] = useState("event");
  const [commsKind, setCommsKind] = useState<CommsKind>("imessage");
  const [commitmentTiming, setCommitmentTiming] =
    useState<CommitmentTiming>("planned");
  const [time, setTime] = useState(toLocalDtInput(new Date().toISOString()));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep("family");
    setFamily(null);
    setInteractionTiming("past");
    setCategory("personal");
    setEventKind("event");
    setCommsKind("imessage");
    setCommitmentTiming("planned");
    setTime(toLocalDtInput(new Date().toISOString()));
    setNotes("");
    setBusy(false);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const totalSteps = 3;

  function selectFamily(next: ContextFamily) {
    setFamily(next);
    setError(null);
    if (next === "note") {
      setStep("capture");
    } else {
      setStep("configure");
    }
  }

  function goBack() {
    setError(null);
    if (step === "capture") {
      setStep(family === "note" ? "family" : "configure");
    } else if (step === "configure") {
      setStep("family");
    }
  }

  function goNext() {
    setError(null);
    if (step === "configure") {
      setStep("capture");
    }
  }

  const canContinue =
    step === "family"
      ? false
      : step === "configure"
        ? family !== null
        : time.trim().length > 0 &&
          (family !== "commitment" || notes.trim().length > 0);

  async function handleSubmit() {
    if (!family || busy) return;

    const trimmedNotes = notes.trim();
    const isoTime = fromLocalDtInput(time);

    if (family === "commitment" && trimmedNotes === "") {
      setError("Describe the commitment.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      let result: AddContextResult;

      if (family === "commitment") {
        result = {
          family,
          time: isoTime,
          notes: null,
          commitment: {
            description: trimmedNotes,
            timing: commitmentTiming,
          },
        };
      } else if (family === "note") {
        result = {
          family,
          time: isoTime,
          notes: trimmedNotes === "" ? null : trimmedNotes,
          interaction: {
            kind: "note",
            category: "personal",
            status: "occurred",
          },
        };
      } else if (family === "comms") {
        result = {
          family,
          time: isoTime,
          notes: trimmedNotes === "" ? null : trimmedNotes,
          interaction: {
            kind: commsKind,
            category: "personal",
            status: "occurred",
          },
        };
      } else {
        const status = defaultStatusForInteractionTiming(interactionTiming);
        result = {
          family: "interaction",
          time: isoTime,
          notes: trimmedNotes === "" ? null : trimmedNotes,
          interaction: {
            kind: eventKind,
            category,
            status,
          },
        };
      }

      await onSubmit(result);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save context.",
      );
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <>
      {step !== "family" ? (
        <Button variant="ghost" onClick={goBack} disabled={busy}>
          Back
        </Button>
      ) : (
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      )}
      {step === "capture" ? (
        <Button variant="primary" onClick={handleSubmit} loading={busy}>
          Add context
        </Button>
      ) : step === "configure" ? (
        <Button
          variant="primary"
          onClick={goNext}
          disabled={!canContinue || busy}
        >
          Continue
        </Button>
      ) : null}
    </>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={stepTitle(step, family)}
      subtitle={`Step ${STEP_NUMBER[step]} of ${totalSteps} · ${stepSubtitle(step, family)}`}
      footer={footer}
      size="md"
      className="flex max-h-[min(85vh,640px)] flex-col"
    >
      <div className="-mx-5 max-h-[min(52vh,420px)] overflow-y-auto px-5">
        {step === "family" && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {(
              ["interaction", "note", "comms", "commitment"] as ContextFamily[]
            ).map((f) => (
              <li key={f}>
                <FamilyOption
                  family={f}
                  icon={FAMILY_ICONS[f]}
                  onSelect={() => selectFamily(f)}
                />
              </li>
            ))}
          </ul>
        )}

        {step === "configure" && family === "interaction" && (
          <div className="space-y-4">
            <FormField label="When is it?" htmlFor="interaction-timing">
              <div className="flex gap-2">
                <TimingToggle
                  selected={interactionTiming === "past"}
                  label="Past"
                  onSelect={() => setInteractionTiming("past")}
                />
                <TimingToggle
                  selected={interactionTiming === "future"}
                  label="Upcoming"
                  onSelect={() => setInteractionTiming("future")}
                />
              </div>
            </FormField>
            <FormField label="Category" htmlFor="interaction-category">
              <Select
                id="interaction-category"
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as InteractionCategory)
                }
              >
                {INTERACTION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Type" htmlFor="interaction-kind">
              <Select
                id="interaction-kind"
                value={eventKind}
                onChange={(e) => setEventKind(e.target.value)}
              >
                <option value="event">Event</option>
                <option value="meeting">Meeting</option>
                <option value="activity">Activity</option>
                <option value="catch-up">Catch-up</option>
                <option value="dinner">Dinner</option>
                <option value="coffee">Coffee</option>
              </Select>
            </FormField>
          </div>
        )}

        {step === "configure" && family === "comms" && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {COMMS_KINDS.map((kind) => (
              <li key={kind}>
                <ChannelOption
                  kind={kind}
                  selected={commsKind === kind}
                  icon={CHANNEL_ICONS[kind]}
                  onSelect={() => setCommsKind(kind)}
                />
              </li>
            ))}
          </ul>
        )}

        {step === "configure" && family === "commitment" && (
          <ul className="space-y-2">
            {COMMITMENT_OPTIONS.map((opt) => (
              <li key={opt.value}>
                <CommitmentOption
                  selected={commitmentTiming === opt.value}
                  label={opt.label}
                  description={opt.description}
                  onSelect={() => setCommitmentTiming(opt.value)}
                />
              </li>
            ))}
          </ul>
        )}

        {step === "capture" && family && (
          <div className="space-y-4">
            {family !== "note" && (
              <FormField label="When" htmlFor="context-when">
                <Input
                  id="context-when"
                  type="datetime-local"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  disabled={busy}
                  autoFocus
                />
              </FormField>
            )}
            {family === "note" && (
              <FormField label="When (optional)" htmlFor="context-when-note">
                <Input
                  id="context-when-note"
                  type="datetime-local"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  disabled={busy}
                  autoFocus
                />
              </FormField>
            )}
            <FormField
              label={
                family === "commitment" ? "What is the commitment?" : "Notes"
              }
              htmlFor="context-notes"
            >
              <Textarea
                id="context-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={
                  family === "commitment"
                    ? "e.g. send the photos from Saturday"
                    : family === "comms"
                      ? "What was said? Anything to remember."
                      : family === "interaction"
                        ? "What happened or what's planned?"
                        : "Facts, impressions, things to remember."
                }
                rows={family === "note" ? 6 : 4}
                disabled={busy}
                autoFocus={family === "note"}
              />
            </FormField>
            {family === "commitment" && (
              <p className="text-[12px] text-fg-subtle">
                {commitmentTiming === "planned"
                  ? "Adds an open commitment — also visible in Open threads."
                  : commitmentTiming === "completed"
                    ? "Logged as a completed commitment in your timeline."
                    : "Logged as a missed commitment in your timeline."}
              </p>
            )}
            {family === "interaction" && (
              <p className="text-[12px] text-fg-subtle">
                Status:{" "}
                <span className="text-fg-muted">
                  {defaultStatusForInteractionTiming(interactionTiming)}
                </span>
              </p>
            )}
            {family === "commitment" &&
              defaultStatusForCommitmentTiming(commitmentTiming) && (
                <p className="text-[12px] text-fg-subtle">
                  Status:{" "}
                  <span className="text-fg-muted">
                    {defaultStatusForCommitmentTiming(commitmentTiming)}
                  </span>
                </p>
              )}
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

function FamilyOption({
  family,
  icon,
  onSelect,
}: {
  family: ContextFamily;
  icon: React.ReactNode;
  onSelect: () => void;
}) {
  const meta = FAMILY_META[family];
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex h-full w-full flex-col items-start gap-2 rounded-md border border-divider px-4 py-3 text-left transition-colors hover:border-fg-subtle hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span className="text-fg-muted">{icon}</span>
      <span className="text-[15px] font-medium text-fg">{meta.label}</span>
      <span className="text-[12px] leading-[18px] text-fg-muted">
        {meta.description}
      </span>
      <span className="text-[11px] uppercase tracking-[0.06em] text-fg-subtle">
        {meta.timingHint}
      </span>
    </button>
  );
}

function TimingToggle({
  selected,
  label,
  onSelect,
}: {
  selected: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex-1 rounded-md border px-3 py-2 text-[14px] transition-colors",
        selected
          ? "border-accent bg-accent/5 text-fg"
          : "border-divider text-fg-muted hover:bg-hover",
      )}
    >
      {label}
    </button>
  );
}

function ChannelOption({
  kind,
  selected,
  icon,
  onSelect,
}: {
  kind: CommsKind;
  selected: boolean;
  icon: React.ReactNode;
  onSelect: () => void;
}) {
  const meta = COMMS_CHANNEL_META[kind];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-accent bg-accent/5"
          : "border-divider hover:bg-hover",
      )}
    >
      <span className="text-fg-muted">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] text-fg">{meta.label}</div>
        <div className="text-[12px] text-fg-subtle">{meta.description}</div>
      </div>
    </button>
  );
}

function CommitmentOption({
  selected,
  label,
  description,
  onSelect,
}: {
  selected: boolean;
  label: string;
  description: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full flex-col items-start gap-0.5 rounded-md border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-accent bg-accent/5"
          : "border-divider hover:bg-hover",
      )}
    >
      <span className="text-[14px] font-medium text-fg">{label}</span>
      <span className="text-[12px] text-fg-subtle">{description}</span>
    </button>
  );
}
