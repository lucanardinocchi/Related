import type { SupabaseClient } from "@supabase/supabase-js";
import { GmailClient } from "@related/shared";
import { Resend } from "resend";

export type FeedbackType = "bug" | "feature";
export type FeedbackChannel = "gmail" | "resend";

export interface FeedbackPayload {
  type: FeedbackType;
  message: string;
  userEmail: string;
  pagePath?: string;
}

export interface SendFeedbackResult {
  channel: FeedbackChannel;
}

const FEEDBACK_TO_EMAIL =
  process.env.FEEDBACK_TO_EMAIL ?? "lucanardinocchi@gmail.com";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function feedbackLabel(type: FeedbackType): string {
  return type === "bug" ? "Bug report" : "Feature request";
}

function buildFeedbackContent(payload: FeedbackPayload) {
  const label = feedbackLabel(payload.type);
  const subject = `[Related] ${label}`;
  const textBody = [
    `Type: ${label}`,
    `From: ${payload.userEmail}`,
    `Page: ${payload.pagePath ?? "Unknown page"}`,
    "",
    payload.message.trim(),
  ].join("\n");

  return { label, subject, textBody };
}

async function sendFeedbackViaGmail(
  supabase: SupabaseClient,
  payload: FeedbackPayload,
): Promise<FeedbackChannel | null> {
  try {
    const gmail = new GmailClient(supabase);
    const { subject, textBody } = buildFeedbackContent(payload);
    const result = await gmail.send({
      to: FEEDBACK_TO_EMAIL,
      subject,
      body: textBody,
    });

    if (result.status === "ok") {
      return "gmail";
    }

    if (
      result.status === "no_token" ||
      result.status === "needs_gmail_scopes" ||
      result.status === "needs_reconsent"
    ) {
      return null;
    }

    return null;
  } catch {
    return null;
  }
}

async function sendFeedbackViaResend(payload: FeedbackPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    throw new Error("Feedback email is not configured (missing RESEND_API_KEY)");
  }

  if (!from) {
    throw new Error(
      "Feedback email is not configured (missing RESEND_FROM_EMAIL)",
    );
  }

  const resend = new Resend(apiKey);
  const { label, subject, textBody } = buildFeedbackContent(payload);
  const safeMessage = escapeHtml(payload.message.trim());
  const safePath = payload.pagePath
    ? escapeHtml(payload.pagePath)
    : "Unknown page";

  const html = `
    <p><strong>Type:</strong> ${label}</p>
    <p><strong>From:</strong> ${escapeHtml(payload.userEmail)}</p>
    <p><strong>Page:</strong> ${safePath}</p>
    <hr />
    <p style="white-space: pre-wrap;">${safeMessage}</p>
  `.trim();

  const { error } = await resend.emails.send(
    {
      from,
      to: [FEEDBACK_TO_EMAIL],
      replyTo: payload.userEmail,
      subject: `${subject} from ${payload.userEmail}`,
      html,
      text: textBody,
    },
    {
      idempotencyKey: `feedback/${payload.userEmail}/${Date.now()}`,
    },
  );

  if (error) {
    throw new Error(error.message);
  }
}

/** Sends feedback via Gmail when connected, otherwise Resend. */
export async function sendFeedback(
  supabase: SupabaseClient,
  payload: FeedbackPayload,
): Promise<SendFeedbackResult> {
  const gmailChannel = await sendFeedbackViaGmail(supabase, payload);
  if (gmailChannel) {
    return { channel: gmailChannel };
  }

  await sendFeedbackViaResend(payload);
  return { channel: "resend" };
}
