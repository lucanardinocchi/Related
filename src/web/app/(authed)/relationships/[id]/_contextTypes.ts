import type { Interaction, InteractionStatus, OpenThread } from "@related/shared";

/** Top-level families shown in the add-context flow and timeline. */
export type ContextFamily = "interaction" | "note" | "comms" | "commitment";

/** Commitment lifecycle for capture — maps to open thread vs interaction. */
export type CommitmentTiming = "planned" | "completed" | "missed";

/** Interaction temporal bucket for capture UI. */
export type InteractionTiming = "past" | "future";

export const COMMS_KINDS = [
  "instagram_dm",
  "x_dm",
  "whatsapp",
  "tiktok_dm",
  "imessage",
  "email",
  "phone_call",
] as const;

export type CommsKind = (typeof COMMS_KINDS)[number];

export const COMMS_CHANNEL_META: Record<
  CommsKind,
  { label: string; description: string }
> = {
  instagram_dm: { label: "Instagram DM", description: "Direct message on Instagram" },
  x_dm: { label: "X DM", description: "Direct message on X" },
  whatsapp: { label: "WhatsApp", description: "WhatsApp chat" },
  tiktok_dm: { label: "TikTok DM", description: "Direct message on TikTok" },
  imessage: { label: "iMessage", description: "Apple Messages / SMS" },
  email: { label: "Email", description: "Email thread" },
  phone_call: { label: "Phone call", description: "Voice call" },
};

const LEGACY_SMS_KIND = "sms";

export function isCommsKind(kind: string): boolean {
  return (
    (COMMS_KINDS as readonly string[]).includes(kind) ||
    kind === LEGACY_SMS_KIND
  );
}

export function commsKindLabel(kind: string): string {
  if (kind === LEGACY_SMS_KIND) return COMMS_CHANNEL_META.imessage.label;
  const meta = COMMS_CHANNEL_META[kind as CommsKind];
  return meta?.label ?? kind;
}

export function normalizeCommsKind(kind: string): CommsKind | string {
  if (kind === LEGACY_SMS_KIND) return "imessage";
  return kind;
}

export function contextFamilyFromKind(kind: string): ContextFamily {
  if (kind === "note") return "note";
  if (kind === "commitment") return "commitment";
  if (kind === "event" || kind === "meeting" || kind === "activity") return "interaction";
  if (isCommsKind(kind)) return "comms";
  return "interaction";
}

export function contextFamilyFromInteraction(
  interaction: Interaction,
): ContextFamily {
  return contextFamilyFromKind(interaction.kind);
}

export const FAMILY_META: Record<
  ContextFamily,
  { label: string; description: string; timingHint: string }
> = {
  interaction: {
    label: "Interaction",
    description: "A meet-up, call, or event tied to a specific moment",
    timingHint: "Past or upcoming",
  },
  note: {
    label: "Note",
    description: "Free-form context — facts, impressions, things to remember",
    timingHint: "Logged now",
  },
  comms: {
    label: "Comms",
    description: "A message or call on a specific channel",
    timingHint: "When it happened",
  },
  commitment: {
    label: "Commitment",
    description: "Something you owe or planned to do for them",
    timingHint: "Planned, done, or missed",
  },
};

export function familyLabel(family: ContextFamily): string {
  return FAMILY_META[family].label;
}

export function interactionTiming(
  status: InteractionStatus,
): InteractionTiming {
  if (status === "planned") return "future";
  return "past";
}

export function defaultStatusForInteractionTiming(
  timing: InteractionTiming,
): InteractionStatus {
  return timing === "future" ? "planned" : "occurred";
}

export function defaultStatusForCommitmentTiming(
  timing: CommitmentTiming,
): InteractionStatus | null {
  if (timing === "planned") return null;
  if (timing === "completed") return "occurred";
  return "missed";
}

export type TimelineTone = "neutral" | "future" | "past" | "warning" | "lost";

export interface TimelineVisual {
  family: ContextFamily;
  familyLabel: string;
  headline: string;
  subline: string | null;
  timingLabel: string | null;
  tone: TimelineTone;
}

export function timelineVisualForInteraction(
  interaction: Interaction,
): TimelineVisual {
  const family = contextFamilyFromInteraction(interaction);
  const timing = interactionTiming(interaction.status);

  let headline: string;
  if (family === "note") headline = "Note";
  else if (family === "comms") headline = commsKindLabel(interaction.kind);
  else if (family === "commitment") headline = "Commitment";
  else headline = interaction.kind === "event" ? "Event" : kindHeadline(interaction.kind);

  let timingLabel: string | null = null;
  let tone: TimelineTone = "past";

  if (interaction.status === "planned") {
    timingLabel = "Upcoming";
    tone = "future";
  } else if (interaction.status === "missed" || interaction.status === "cancelled") {
    timingLabel = interaction.status === "missed" ? "Missed" : "Cancelled";
    tone = "lost";
  } else if (interaction.status === "attended") {
    timingLabel = "Attended";
    tone = "past";
  } else if (family === "interaction" && timing === "future") {
    timingLabel = "Upcoming";
    tone = "future";
  } else if (family === "commitment" && interaction.status === "occurred") {
    timingLabel = "Completed";
    tone = "past";
  }

  return {
    family,
    familyLabel: FAMILY_META[family].label,
    headline,
    subline: interaction.notes,
    timingLabel,
    tone,
  };
}

export function timelineVisualForOpenThread(thread: OpenThread): TimelineVisual {
  return {
    family: "commitment",
    familyLabel: FAMILY_META.commitment.label,
    headline: thread.description,
    subline: null,
    timingLabel: "Planned",
    tone: "future",
  };
}

function kindHeadline(kind: string): string {
  const labels: Record<string, string> = {
    event: "Event",
    meeting: "Meeting",
    activity: "Activity",
    work: "Work",
    personal: "Personal",
    errands: "Errands",
  };
  return labels[kind] ?? kind.replace(/_/g, " ");
}

export function toneClasses(tone: TimelineTone): {
  family: string;
  timing: "approved" | "sent" | "lost" | "neutral";
} {
  switch (tone) {
    case "future":
      return {
        family: "text-[var(--color-status-sent)]",
        timing: "sent",
      };
    case "lost":
      return { family: "text-fg-muted", timing: "lost" };
    case "warning":
      return { family: "text-[var(--color-warning)]", timing: "sent" };
    case "past":
      return { family: "text-fg-muted", timing: "approved" };
    default:
      return { family: "text-fg-subtle", timing: "neutral" };
  }
}
