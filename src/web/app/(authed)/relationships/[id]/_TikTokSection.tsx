"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus, Send } from "lucide-react";
import { tokenHasTikTokAccess } from "@related/shared";
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
  tiktokUsername: string | null;
  tiktokOpenId: string | null;
  onOpenIdResolved?: (openId: string) => void;
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

export function TikTokSection({
  contactId,
  contactName,
  tiktokUsername,
  tiktokOpenId: initialOpenId,
  onOpenIdResolved,
}: Props) {
  const [tiktokConnected, setTiktokConnected] = useState<boolean | null>(null);
  const [openId, setOpenId] = useState(initialOpenId);
  const [messages, setMessages] = useState<
    Awaited<
      ReturnType<ReturnType<typeof getBrowserDeps>["tiktok"]["listForContact"]>
    >["messages"]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setOpenId(initialOpenId);
  }, [initialOpenId]);

  const checkTikTokConnection = useCallback(async () => {
    const { userProviderTokens } = getBrowserDeps();
    const token = await userProviderTokens.getForProvider("tiktok");
    setTiktokConnected(token !== null && tokenHasTikTokAccess(token.scopes));
  }, []);

  const loadMessages = useCallback(async () => {
    if (!tiktokUsername && !openId) return;
    setLoading(true);
    setError(null);
    try {
      const { tiktok } = getBrowserDeps();
      const result = await tiktok.listForContact({
        contactId,
        tiktokUsername,
        tiktokOpenId: openId,
        maxResults: 25,
      });

      if (
        result.status === "no_token" ||
        result.status === "needs_tiktok_scopes"
      ) {
        setTiktokConnected(false);
        setMessages([]);
        return;
      }
      if (result.status === "needs_reconsent") {
        setTiktokConnected(false);
        setError("TikTok access expired — reconnect in Settings.");
        setMessages([]);
        return;
      }
      if (result.status === "error") {
        setError("Could not load TikTok messages.");
        return;
      }

      setTiktokConnected(true);
      setMessages(result.messages);

      if (result.resolvedOpenId && result.resolvedOpenId !== openId) {
        setOpenId(result.resolvedOpenId);
        onOpenIdResolved?.(result.resolvedOpenId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [contactId, tiktokUsername, openId, onOpenIdResolved]);

  useEffect(() => {
    void checkTikTokConnection();
  }, [checkTikTokConnection]);

  useEffect(() => {
    if (tiktokConnected && (tiktokUsername || openId)) {
      void loadMessages();
    }
  }, [tiktokConnected, tiktokUsername, openId, loadMessages]);

  useEffect(() => {
    if (!tiktokConnected || !contactId) return;
    const { supabase } = getBrowserDeps();
    const channel = supabase
      .channel(`tiktok-messages-contact-${contactId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tiktok_messages",
          filter: `contact_id=eq.${contactId}`,
        },
        () => {
          void loadMessages();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [tiktokConnected, contactId, loadMessages]);

  async function sendMessage() {
    if (!openId || sending) return;
    const trimmedBody = body.trim();
    if (!trimmedBody) return;

    setSending(true);
    setError(null);
    try {
      const { tiktok } = getBrowserDeps();
      const result = await tiktok.send({
        contactId,
        tiktokOpenId: openId,
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

  const hasIdentifier = Boolean(tiktokUsername || openId);
  const canSend = hasIdentifier && tiktokConnected && openId;

  return (
    <Section
      title="TikTok"
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
          title="No TikTok handle on file"
          description={`Add ${contactName}'s TikTok username in Key details to see your DM thread here.`}
        />
      ) : tiktokConnected === null ? (
        <p className="text-[13px] text-fg-muted">Checking TikTok connection…</p>
      ) : !tiktokConnected ? (
        <EmptyState
          title="TikTok not connected"
          description="Connect your TikTok Business account in Settings to read and send DMs."
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
          {!openId ? (
            <p className="text-[13px] text-fg-muted">
              Could not resolve{" "}
              {tiktokUsername
                ? `@${tiktokUsername.replace(/^@/, "")}`
                : "this contact"}{" "}
              on TikTok — check the handle in Key details or wait for them to
              message you first.
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
                openId
                  ? `No TikTok DMs found with ${contactName}. They must message you first — then you can reply within 48 hours.`
                  : "Add a valid TikTok handle to load messages."
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
