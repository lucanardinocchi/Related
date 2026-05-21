"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquare, Plus, Send } from "lucide-react";
import type { Message, MessageThread } from "@related/shared";
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
  contactPhone: string | null;
}

function formatMessageDate(raw: string): string {
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MessagesSection({
  contactId,
  contactName,
  contactPhone,
}: Props) {
  const [relayOnline, setRelayOnline] = useState<boolean | null>(null);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const activeThreadId = useMemo(() => {
    if (threads.length === 1) return threads[0]!.id;
    return selectedThreadId;
  }, [threads, selectedThreadId]);

  const loadThreads = useCallback(async () => {
    const { messages: client } = getBrowserDeps();
    const [online, contactThreads] = await Promise.all([
      client.isRelayOnline(),
      client.listThreadsForContact(contactId),
    ]);
    setRelayOnline(online);
    setThreads(contactThreads);
    if (contactThreads.length === 1) {
      setSelectedThreadId(contactThreads[0]!.id);
    } else if (
      selectedThreadId &&
      !contactThreads.some((t) => t.id === selectedThreadId)
    ) {
      setSelectedThreadId(null);
    }
    return contactThreads;
  }, [contactId, selectedThreadId]);

  const loadMessages = useCallback(async (threadId: string) => {
    const { messages: client } = getBrowserDeps();
    return client.listMessages(threadId);
  }, []);

  const refresh = useCallback(async () => {
    if (!contactPhone) return;
    setLoading(true);
    setError(null);
    try {
      const contactThreads = await loadThreads();
      const threadId =
        contactThreads.length === 1 ? contactThreads[0]!.id : selectedThreadId;
      if (threadId) {
        setMessages(await loadMessages(threadId));
      } else {
        setMessages([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [contactPhone, loadMessages, loadThreads, selectedThreadId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!activeThreadId) return;
    void loadMessages(activeThreadId).then(setMessages).catch(() => {});
  }, [activeThreadId, loadMessages]);

  useEffect(() => {
    if (!activeThreadId) return;

    const { supabase } = getBrowserDeps();
    const channel = supabase
      .channel(`messages:${activeThreadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `thread_id=eq.${activeThreadId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            thread_id: string;
            direction: "inbound" | "outbound";
            body: string;
            sent_at: string;
            service: string | null;
          };
          const incoming: Message = {
            id: row.id,
            threadId: row.thread_id,
            externalMessageId: row.id,
            direction: row.direction,
            body: row.body,
            sentAt: row.sent_at,
            service: row.service,
            createdAt: row.sent_at,
          };
          setMessages((prev) =>
            prev.some((m) => m.id === incoming.id)
              ? prev
              : [...prev, incoming],
          );
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeThreadId]);

  async function sendSms() {
    if (!contactPhone || sending) return;
    const trimmed = body.trim();
    if (!trimmed) return;

    setSending(true);
    setError(null);
    try {
      const { messages: client } = getBrowserDeps();
      await client.sendMessage({
        contactId,
        threadId: activeThreadId ?? undefined,
        body: trimmed,
      });
      setBody("");
      setComposing(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  const canSend = Boolean(contactPhone);
  const showThreadPicker = threads.length > 1;

  return (
    <Section
      title="Messages"
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
      {!contactPhone ? (
        <EmptyState
          title="No phone on file"
          description={`Add ${contactName}'s phone number in Key details to see your iMessage/SMS thread here.`}
        />
      ) : relayOnline === null && loading ? (
        <p className="text-[13px] text-fg-muted">Loading messages…</p>
      ) : (
        <div className="space-y-4">
          {relayOnline === false ? (
            <div className="rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-fg-muted">
              Mac relay is offline — showing cached messages. New sends queue
              until your relay reconnects.{" "}
              <Link href="/settings" className="text-accent hover:underline">
                Check Settings
              </Link>
            </div>
          ) : null}

          {showThreadPicker ? (
            <div className="flex flex-wrap gap-2">
              {threads.map((thread) => (
                <Button
                  key={thread.id}
                  variant={selectedThreadId === thread.id ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setSelectedThreadId(thread.id)}
                >
                  {thread.displayName ?? thread.externalChatId}
                </Button>
              ))}
            </div>
          ) : null}

          {composing && (
            <div className="space-y-2 rounded-md border border-border bg-surface p-3">
              <Textarea
                placeholder={`Message ${contactName}…`}
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
                  onClick={() => void sendSms()}
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

          {error ? (
            <p className="text-[13px] text-danger">{error}</p>
          ) : null}

          {loading ? (
            <p className="text-[13px] text-fg-muted">Loading messages…</p>
          ) : showThreadPicker && !selectedThreadId ? (
            <EmptyState
              title="Select a thread"
              description="This contact has multiple message threads. Pick one above to view messages."
              icon={<MessageSquare size={28} />}
            />
          ) : messages.length === 0 ? (
            <EmptyState
              title="No messages yet"
              description={
                relayOnline
                  ? `No synced messages with ${contactPhone}. Send one to start the thread.`
                  : `No cached messages with ${contactPhone}. Connect your Mac relay in Settings.`
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
                        <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-fg-subtle">
                          {m.direction === "outbound" ? "Sent" : "Received"}
                        </span>
                        {m.service ? (
                          <span className="text-[11px] text-fg-subtle">
                            {m.service}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[13px] text-fg">
                        {m.body}
                      </p>
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
