"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Button, Modal, Pill, Textarea } from "@/components/ui";
import { FormField } from "@/components/ui/FormField";

type FeedbackType = "bug" | "feature";
type FeedbackChannel = "gmail" | "resend";

interface Props {
  open: boolean;
  onClose: () => void;
  userEmail: string;
  gmailConnected: boolean;
}

export function FeedbackModal({
  open,
  onClose,
  userEmail,
  gmailConnected,
}: Props) {
  const pathname = usePathname();
  const [type, setType] = useState<FeedbackType>("bug");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [channel, setChannel] = useState<FeedbackChannel | null>(null);

  useEffect(() => {
    if (!open) return;
    setType("bug");
    setMessage("");
    setSubmitting(false);
    setError(null);
    setSent(false);
    setChannel(null);
  }, [open]);

  async function handleSubmit() {
    const trimmed = message.trim();
    if (!trimmed) {
      setError("Please describe your feedback.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          message: trimmed,
          pagePath: pathname,
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        channel?: FeedbackChannel;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to send feedback");
      }

      setChannel(data.channel ?? (gmailConnected ? "gmail" : "resend"));
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send feedback");
    } finally {
      setSubmitting(false);
    }
  }

  const sentViaGmail = channel === "gmail";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={sent ? "Thanks for your feedback" : "Send feedback"}
      subtitle={
        sent
          ? sentViaGmail
            ? "It landed in our inbox from your Gmail. Reply there and we'll pick it up."
            : "We'll reply to your account email if we need more detail."
          : gmailConnected
            ? "Report a bug or suggest a feature. Sends from your connected Gmail."
            : "Report a bug or suggest a feature. Connect Gmail in Settings to send from your inbox."
      }
      size="sm"
      footer={
        sent ? (
          <Button type="button" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => void handleSubmit()}
              loading={submitting}
              disabled={submitting}
            >
              Send feedback
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <p className="text-[14px] leading-[22px] text-fg-subtle">
          {sentViaGmail ? (
            <>
              Your message was sent from{" "}
              <span className="text-fg">{userEmail}</span>. When we reply in
              Gmail, it goes straight back to you.
            </>
          ) : (
            <>
              Your message was sent to the Related team. Replies go to{" "}
              <span className="text-fg">{userEmail}</span>.
            </>
          )}
        </p>
      ) : (
        <div className="space-y-4">
          <FormField label="Type">
            <div className="flex flex-wrap gap-2">
              <Pill active={type === "bug"} onClick={() => setType("bug")}>
                Bug
              </Pill>
              <Pill
                active={type === "feature"}
                onClick={() => setType("feature")}
              >
                Feature
              </Pill>
            </div>
          </FormField>

          <FormField
            label="What would you like to share?"
            htmlFor="feedback-message"
          >
            <Textarea
              id="feedback-message"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                type === "bug"
                  ? "What happened? What did you expect instead?"
                  : "What would you like Related to do?"
              }
              disabled={submitting}
            />
          </FormField>

          <p className="text-[12px] leading-[18px] text-fg-subtle">
            {gmailConnected ? (
              <>
                Sending from your Gmail{" "}
                <span className="text-fg-muted">({userEmail})</span>
              </>
            ) : (
              <>
                Sending as <span className="text-fg-muted">{userEmail}</span>
              </>
            )}
          </p>

          {error && (
            <p className="text-[13px] text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
