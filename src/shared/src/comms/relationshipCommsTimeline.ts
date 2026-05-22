import type { GmailMessageSummary } from "../integrations/GmailClient";
import type { InstagramMessageSummary } from "../integrations/InstagramClient";
import type { TikTokMessageSummary } from "../integrations/TikTokClient";
import type { WhatsAppMessageSummary } from "../integrations/WhatsAppClient";
import type { XMessageSummary } from "../integrations/XClient";
import type { Message } from "../messages/MessagesClient";

export type CommsPlatform =
  | "imessage"
  | "email"
  | "instagram"
  | "x"
  | "whatsapp"
  | "tiktok";

export type CommsDirection = "sent" | "received";

export interface CommsTimelineItem {
  id: string;
  platform: CommsPlatform;
  direction: CommsDirection;
  sentAt: string;
  body: string;
  subject?: string;
  snippet?: string;
  /** Gmail message id — used to fetch full body on expand. */
  emailMessageId?: string;
  /** Preloaded email body (seed/cache) — skips Gmail fetch on expand. */
  emailFullBody?: string;
}

export interface CommsPlatformMessageRow {
  platform: "email" | "instagram" | "x";
  external_id: string;
  direction: CommsDirection;
  body: string;
  subject?: string | null;
  snippet?: string | null;
  sent_at: string;
}

function parseTimestamp(raw: string): number {
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

export function fromImessageMessage(message: Message): CommsTimelineItem {
  return {
    id: `imessage:${message.id}`,
    platform: "imessage",
    direction: message.direction === "outbound" ? "sent" : "received",
    sentAt: message.sentAt,
    body: message.body,
  };
}

export function fromGmailMessage(message: GmailMessageSummary): CommsTimelineItem {
  return {
    id: `email:${message.id}`,
    platform: "email",
    direction: message.direction,
    sentAt: message.date,
    body: message.snippet || message.subject,
    subject: message.subject,
    snippet: message.snippet,
    emailMessageId: message.id,
  };
}

export function fromWhatsAppMessage(
  message: WhatsAppMessageSummary,
): CommsTimelineItem {
  return {
    id: `whatsapp:${message.id}`,
    platform: "whatsapp",
    direction: message.direction,
    sentAt: message.sentAt,
    body: message.text,
  };
}

export function fromInstagramMessage(
  message: InstagramMessageSummary,
): CommsTimelineItem {
  return {
    id: `instagram:${message.id}`,
    platform: "instagram",
    direction: message.direction,
    sentAt: message.sentAt,
    body: message.text,
  };
}

export function fromXMessage(message: XMessageSummary): CommsTimelineItem {
  return {
    id: `x:${message.id}`,
    platform: "x",
    direction: message.direction,
    sentAt: message.sentAt,
    body: message.text,
  };
}

export function fromTikTokMessage(
  message: TikTokMessageSummary,
): CommsTimelineItem {
  return {
    id: `tiktok:${message.id}`,
    platform: "tiktok",
    direction: message.direction,
    sentAt: message.sentAt,
    body: message.text,
  };
}

export function fromCommsPlatformMessage(
  row: CommsPlatformMessageRow,
): CommsTimelineItem {
  const platform = row.platform;
  const preview = row.snippet?.trim() || row.body;
  return {
    id: `${platform}:${row.external_id}`,
    platform,
    direction: row.direction,
    sentAt: row.sent_at,
    body: preview,
    subject: row.subject ?? undefined,
    snippet: row.snippet ?? undefined,
    emailFullBody: platform === "email" ? row.body : undefined,
  };
}

export function fromInstagramRow(row: {
  ig_message_id: string;
  direction: "inbound" | "outbound";
  text: string;
  sent_at: string;
}): CommsTimelineItem {
  return {
    id: `instagram:${row.ig_message_id}`,
    platform: "instagram",
    direction: row.direction === "outbound" ? "sent" : "received",
    sentAt: row.sent_at,
    body: row.text,
  };
}

export function fromWhatsAppRow(row: {
  wa_message_id: string;
  direction: "inbound" | "outbound";
  text: string;
  sent_at: string;
}): CommsTimelineItem {
  return {
    id: `whatsapp:${row.wa_message_id}`,
    platform: "whatsapp",
    direction: row.direction === "outbound" ? "sent" : "received",
    sentAt: row.sent_at,
    body: row.text,
  };
}

export function fromXRow(row: {
  x_message_id: string;
  direction: "sent" | "received";
  text: string | null;
  sent_at: string;
}): CommsTimelineItem {
  return {
    id: `x:${row.x_message_id}`,
    platform: "x",
    direction: row.direction,
    sentAt: row.sent_at,
    body: row.text ?? "",
  };
}

export function fromTikTokRow(row: {
  tiktok_message_id: string;
  direction: "inbound" | "outbound";
  text: string;
  sent_at: string;
}): CommsTimelineItem {
  return {
    id: `tiktok:${row.tiktok_message_id}`,
    platform: "tiktok",
    direction: row.direction === "outbound" ? "sent" : "received",
    sentAt: row.sent_at,
    body: row.text,
  };
}

export function mergeCommsTimelineItems(
  items: CommsTimelineItem[],
): CommsTimelineItem[] {
  return [...items].sort(
    (a, b) => parseTimestamp(b.sentAt) - parseTimestamp(a.sentAt),
  );
}

export const COMMS_PLATFORM_LABELS: Record<CommsPlatform, string> = {
  imessage: "iMessage",
  email: "Email",
  instagram: "Instagram",
  x: "X",
  whatsapp: "WhatsApp",
  tiktok: "TikTok",
};
