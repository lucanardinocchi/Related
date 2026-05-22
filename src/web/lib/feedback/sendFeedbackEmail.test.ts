import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendFeedback } from "./sendFeedbackEmail";

const sendMock = vi.fn();
const gmailSendMock = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

vi.mock("@related/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@related/shared")>();
  return {
    ...actual,
    GmailClient: class {
      send = gmailSendMock;
    },
  };
});

describe("sendFeedback", () => {
  const supabase = {} as SupabaseClient;
  const payload = {
    type: "bug" as const,
    message: "The calendar view is blank.",
    userEmail: "user@example.com",
    pagePath: "/calendar",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM_EMAIL = "Related <feedback@example.com>";
    process.env.FEEDBACK_TO_EMAIL = "lucanardinocchi@gmail.com";
    sendMock.mockResolvedValue({ data: { id: "email_123" }, error: null });
  });

  it("sends from the user's Gmail when Gmail is connected", async () => {
    gmailSendMock.mockResolvedValue({ status: "ok", messageId: "msg_123" });

    const result = await sendFeedback(supabase, payload);

    expect(result).toEqual({ channel: "gmail" });
    expect(gmailSendMock).toHaveBeenCalledWith({
      to: "lucanardinocchi@gmail.com",
      subject: "[Related] Bug report",
      body: expect.stringContaining("The calendar view is blank."),
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("falls back to Resend when Gmail is not connected", async () => {
    gmailSendMock.mockResolvedValue({ status: "needs_gmail_scopes", messageId: null });

    const result = await sendFeedback(supabase, payload);

    expect(result).toEqual({ channel: "resend" });
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Related <feedback@example.com>",
        to: ["lucanardinocchi@gmail.com"],
        replyTo: "user@example.com",
        subject: "[Related] Bug report from user@example.com",
      }),
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^feedback\//),
      }),
    );
  });

  it("throws when Gmail is unavailable and Resend is not configured", async () => {
    gmailSendMock.mockResolvedValue({ status: "no_token", messageId: null });
    delete process.env.RESEND_API_KEY;

    await expect(sendFeedback(supabase, payload)).rejects.toThrow(
      "missing RESEND_API_KEY",
    );
  });
});
