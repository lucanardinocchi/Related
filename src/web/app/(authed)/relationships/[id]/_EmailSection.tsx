"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus, Send } from "lucide-react";
import {
  type GmailMessageSummary,
  tokenHasGmailAccess,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import {
  Button,
  EmptyState,
  Input,
  Section,
  Textarea,
} from "@/components/ui";

interface Props {
  contactEmail: string | null;
  contactName: string;
}

function formatMessageDate(raw: string): string {
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EmailSection({ contactEmail, contactName }: Props) {
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<GmailMessageSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const checkGmailConnection = useCallback(async () => {
    const { userProviderTokens } = getBrowserDeps();
    const token = await userProviderTokens.getForProvider("google");
    setGmailConnected(token !== null && tokenHasGmailAccess(token.scopes));
  }, []);

  const loadMessages = useCallback(async () => {
    if (!contactEmail) return;
    setLoading(true);
    setError(null);
    try {
      const { gmail } = getBrowserDeps();
      const result = await gmail.listForContact({ contactEmail, maxResults: 25 });
      if (result.status === "no_token" || result.status === "needs_gmail_scopes") {
        setGmailConnected(false);
        setMessages([]);
        return;
      }
      if (result.status === "needs_reconsent") {
        setGmailConnected(false);
        setError("Gmail access expired — reconnect in Settings.");
        setMessages([]);
        return;
      }
      if (result.status === "error") {
        setError("Could not load emails.");
        return;
      }
      setGmailConnected(true);
      setMessages(result.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load emails.");
    } finally {
      setLoading(false);
    }
  }, [contactEmail]);

  useEffect(() => {
    void checkGmailConnection();
  }, [checkGmailConnection]);

  useEffect(() => {
    if (gmailConnected && contactEmail) {
      void loadMessages();
    }
  }, [gmailConnected, contactEmail, loadMessages]);

  async function sendEmail() {
    if (!contactEmail || sending) return;
    const trimmedSubject = subject.trim();
    const trimmedBody = body.trim();
    if (!trimmedSubject || !trimmedBody) return;

    setSending(true);
    setError(null);
    try {
      const { gmail } = getBrowserDeps();
      const result = await gmail.send({
        to: contactEmail,
        subject: trimmedSubject,
        body: trimmedBody,
      });
      if (result.status !== "ok") {
        setError("Could not send email — check Gmail in Settings.");
        return;
      }
      setSubject("");
      setBody("");
      setComposing(false);
      await loadMessages();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send email.");
    } finally {
      setSending(false);
    }
  }

  const canSend = contactEmail && gmailConnected;

  return (
    <Section
      title="Email"
      meta={
        messages.length > 0 ? `${messages.length} messages` : undefined
      }
      actions={
        canSend && !composing ? (
          <Button
            variant="ghost"
            size="sm"
            leading={<Plus size={14} />}
            onClick={() => setComposing(true)}
          >
            Compose
          </Button>
        ) : null
      }
    >
      {!contactEmail ? (
        <EmptyState
          title="No email on file"
          description={`Add ${contactName}'s email address in Key details to see your Gmail correspondence here.`}
        />
      ) : gmailConnected === null ? (
        <p className="text-[13px] text-fg-muted">Checking Gmail connection…</p>
      ) : !gmailConnected ? (
        <EmptyState
          title="Gmail not connected"
          description="Connect Gmail in Settings to read and send email with this contact."
          action={
            <Link href="/settings">
              <Button variant="secondary" size="sm">
                Go to Settings
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {composing && (
            <div className="space-y-2 rounded-md border border-border bg-surface p-3">
              <Input
                placeholder="Subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
              <Textarea
                placeholder={`Write to ${contactName}…`}
                value={body}
                rows={4}
                onChange={(e) => setBody(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  leading={<Send size={14} />}
                  loading={sending}
                  disabled={!subject.trim() || !body.trim()}
                  onClick={() => void sendEmail()}
                >
                  Send
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setComposing(false);
                    setSubject("");
                    setBody("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-[13px] text-danger">{error}</p>
          )}

          {loading ? (
            <p className="text-[13px] text-fg-muted">Loading emails…</p>
          ) : messages.length === 0 ? (
            <EmptyState
              title="No emails yet"
              description={`No Gmail messages found with ${contactEmail}. Send one to start the thread.`}
              action={
                !composing ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    leading={<Plus size={14} />}
                    onClick={() => setComposing(true)}
                  >
                    Compose
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y divide-divider">
              {messages.map((m) => (
                <li key={m.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-medium text-fg">
                          {m.subject}
                        </span>
                        <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-fg-subtle">
                          {m.direction === "sent" ? "Sent" : "Received"}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-fg-muted">
                        {m.direction === "sent" ? `To ${m.to}` : `From ${m.from}`}
                      </p>
                      {m.snippet && (
                        <p className="mt-1 line-clamp-2 text-[13px] text-fg-subtle">
                          {m.snippet}
                        </p>
                      )}
                    </div>
                    <time className="shrink-0 text-[12px] text-fg-subtle">
                      {formatMessageDate(m.date)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  );
}
