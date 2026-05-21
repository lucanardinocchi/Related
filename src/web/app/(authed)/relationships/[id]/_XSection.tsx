"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus, Send } from "lucide-react";
import { tokenHasXAccess } from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import {
  Button,
  EmptyState,
  Section,
  Textarea,
} from "@/components/ui";

interface Props {
  contactId: string;
  contactName: string;
  xUsername: string | null;
  xUserId: string | null;
  onUserIdResolved?: (userId: string) => void;
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

export function XSection({
  contactId,
  contactName,
  xUsername,
  xUserId: initialUserId,
  onUserIdResolved,
}: Props) {
  const [xConnected, setXConnected] = useState<boolean | null>(null);
  const [userId, setUserId] = useState(initialUserId);
  const [messages, setMessages] = useState<
    Awaited<
      ReturnType<ReturnType<typeof getBrowserDeps>["x"]["listForContact"]>
    >["messages"]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setUserId(initialUserId);
  }, [initialUserId]);

  const checkXConnection = useCallback(async () => {
    const { userProviderTokens } = getBrowserDeps();
    const token = await userProviderTokens.getForProvider("x");
    setXConnected(token !== null && tokenHasXAccess(token.scopes));
  }, []);

  const loadMessages = useCallback(async () => {
    if (!xUsername && !userId) return;
    setLoading(true);
    setError(null);
    try {
      const { x } = getBrowserDeps();
      const result = await x.listForContact({
        contactId,
        xUsername,
        xUserId: userId,
        maxResults: 25,
      });

      if (result.status === "no_token" || result.status === "needs_x_scopes") {
        setXConnected(false);
        setMessages([]);
        return;
      }
      if (result.status === "needs_reconsent") {
        setXConnected(false);
        setError("X access expired — reconnect in Settings.");
        setMessages([]);
        return;
      }
      if (result.status === "error") {
        setError("Could not load X messages.");
        return;
      }

      setXConnected(true);
      setMessages(result.messages);

      if (result.resolvedUserId && result.resolvedUserId !== userId) {
        setUserId(result.resolvedUserId);
        onUserIdResolved?.(result.resolvedUserId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [contactId, xUsername, userId, onUserIdResolved]);

  useEffect(() => {
    void checkXConnection();
  }, [checkXConnection]);

  useEffect(() => {
    if (xConnected && (xUsername || userId)) {
      void loadMessages();
    }
  }, [xConnected, xUsername, userId, loadMessages]);

  async function sendMessage() {
    if (!userId || sending) return;
    const trimmedBody = body.trim();
    if (!trimmedBody) return;

    setSending(true);
    setError(null);
    try {
      const { x } = getBrowserDeps();
      const result = await x.send({
        contactId,
        xUserId: userId,
        text: trimmedBody,
      });
      if (result.status !== "ok") {
        setError("Could not send message.");
        return;
      }
      setBody("");
      setComposing(false);
      await loadMessages();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  const hasIdentifier = Boolean(xUsername || userId);
  const canSend = hasIdentifier && xConnected && userId;

  return (
    <Section
      title="X"
      meta={messages.length > 0 ? `${messages.length} messages` : undefined}
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
      {!hasIdentifier ? (
        <EmptyState
          title="No X handle on file"
          description={`Add ${contactName}'s X username in Key details to see your DM thread here.`}
        />
      ) : xConnected === null ? (
        <p className="text-[13px] text-fg-muted">Checking X connection…</p>
      ) : !xConnected ? (
        <EmptyState
          title="X not connected"
          description="Connect your X account in Settings to read and send DMs."
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
          {!userId ? (
            <p className="text-[13px] text-fg-muted">
              Could not resolve{" "}
              {xUsername ? `@${xUsername.replace(/^@/, "")}` : "this contact"}{" "}
              on X — check the handle in Key details.
            </p>
          ) : null}

          {composing && (
            <div className="space-y-2 rounded-md border border-border bg-surface p-3">
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
                  disabled={!body.trim()}
                  onClick={() => void sendMessage()}
                >
                  Send
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setComposing(false);
                    setBody("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {error && <p className="text-[13px] text-danger">{error}</p>}

          {loading ? (
            <p className="text-[13px] text-fg-muted">Loading messages…</p>
          ) : messages.length === 0 ? (
            <EmptyState
              title="No messages yet"
              description={
                userId
                  ? `No X DMs found with ${contactName}. Send one to start the thread.`
                  : "Add a valid X handle to load messages."
              }
              action={
                canSend && !composing ? (
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
                          {m.fromUsername
                            ? `@${m.fromUsername.replace(/^@/, "")}`
                            : contactName}
                        </span>
                        <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-fg-subtle">
                          {m.direction === "sent" ? "Sent" : "Received"}
                        </span>
                      </div>
                      {m.text ? (
                        <p className="mt-1 whitespace-pre-wrap text-[13px] text-fg-subtle">
                          {m.text}
                        </p>
                      ) : null}
                    </div>
                    <time className="shrink-0 text-[12px] text-fg-subtle">
                      {formatMessageDate(m.sentAt)}
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
