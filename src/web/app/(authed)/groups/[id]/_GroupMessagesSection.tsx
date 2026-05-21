"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Link2, Plus, Send } from "lucide-react";
import { normalizePhone, type Message, type MessageThread } from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import {
  Button,
  EmptyState,
  Section,
  Textarea,
} from "@/components/ui";

interface GroupMember {
  id: string;
  name: string;
  phone: string | null;
}

interface Props {
  groupId: string;
  groupName: string;
  members: GroupMember[];
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

export function GroupMessagesSection({
  groupId,
  groupName,
  members,
}: Props) {
  const [relayOnline, setRelayOnline] = useState<boolean | null>(null);
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [unlinkedThreads, setUnlinkedThreads] = useState<MessageThread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const memberPhones = members
    .map((m) => m.phone)
    .filter((p): p is string => Boolean(p));
  const hasMemberPhones = memberPhones.length > 0;

  const loadData = useCallback(async () => {
    const { messages: client } = getBrowserDeps();
    const [online, groupThreads, allUnlinked] = await Promise.all([
      client.isRelayOnline(),
      client.listThreadsForGroup(groupId),
      client.listUnlinkedThreads(),
    ]);

    const memberPhoneSet = new Set(
      memberPhones.map((p) => normalizePhone(p)),
    );
    const candidateUnlinked = allUnlinked.filter(
      (t) =>
        t.isGroup &&
        t.participantHandles.some((h) =>
          memberPhoneSet.has(normalizePhone(h)),
        ),
    );

    setRelayOnline(online);
    setThreads(groupThreads);
    setUnlinkedThreads(candidateUnlinked);

    if (groupThreads.length > 0) {
      setMessages(await client.listMessages(groupThreads[0]!.id));
    } else {
      setMessages([]);
    }

    return { groupThreads, candidateUnlinked };
  }, [groupId, memberPhones]);

  const refresh = useCallback(async () => {
    if (!hasMemberPhones) return;
    setLoading(true);
    setError(null);
    try {
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [hasMemberPhones, loadData]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeThreadId = threads[0]?.id ?? null;

  useEffect(() => {
    if (!activeThreadId) return;

    const { supabase } = getBrowserDeps();
    const channel = supabase
      .channel(`group-messages:${activeThreadId}`)
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

  async function linkThread(threadId: string) {
    if (linking) return;
    setLinking(threadId);
    setError(null);
    try {
      const { messages: client } = getBrowserDeps();
      await client.linkThread(threadId, { groupId });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not link thread.");
    } finally {
      setLinking(null);
    }
  }

  async function sendSms() {
    if (!hasMemberPhones || sending) return;
    const trimmed = body.trim();
    if (!trimmed) return;

    setSending(true);
    setError(null);
    try {
      const { messages: client } = getBrowserDeps();
      await client.sendMessage({
        groupId,
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

  const showLinkPicker =
    threads.length === 0 && unlinkedThreads.length > 0;

  return (
    <Section
      title="Messages"
      meta={
        messages.length > 0 ? `${messages.length} messages` : undefined
      }
      actions={
        hasMemberPhones && !composing && threads.length > 0 ? (
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
      {!hasMemberPhones ? (
        <EmptyState
          title="No member phone numbers"
          description={`Add phone numbers for ${groupName} members to sync group messages.`}
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

          {showLinkPicker ? (
            <div className="space-y-2 rounded-md border border-border bg-surface p-3">
              <div className="flex items-center gap-2 text-[13px] font-medium text-fg">
                <Link2 size={14} className="text-fg-subtle" />
                Link a group thread
              </div>
              <p className="text-[13px] text-fg-muted">
                We found unlinked group threads that match member phone numbers.
                Pick one to connect to this group.
              </p>
              <ul className="divide-y divide-divider">
                {unlinkedThreads.map((thread) => (
                  <li
                    key={thread.id}
                    className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-fg">
                        {thread.displayName ?? "Group thread"}
                      </p>
                      <p className="truncate text-[12px] text-fg-subtle">
                        {thread.participantHandles.join(", ")}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={linking === thread.id}
                      onClick={() => void linkThread(thread.id)}
                    >
                      Link
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {composing && threads.length > 0 ? (
            <div className="space-y-2 rounded-md border border-border bg-surface p-3">
              <Textarea
                placeholder={`Message ${groupName}…`}
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
          ) : null}

          {error ? (
            <p className="text-[13px] text-danger">{error}</p>
          ) : null}

          {loading ? (
            <p className="text-[13px] text-fg-muted">Loading messages…</p>
          ) : threads.length === 0 && !showLinkPicker ? (
            <EmptyState
              title="No linked thread"
              description={
                relayOnline
                  ? `No group thread linked yet for ${groupName}. Sync from your Mac or send a message once linked.`
                  : "Connect your Mac relay in Settings to sync group threads."
              }
              action={
                !composing && relayOnline ? (
                  <Link href="/settings">
                    <Button variant="secondary" size="sm">
                      Go to Settings
                    </Button>
                  </Link>
                ) : undefined
              }
            />
          ) : threads.length > 0 && messages.length === 0 ? (
            <EmptyState
              title="No messages yet"
              description={`No synced messages in this group thread.`}
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
          ) : threads.length > 0 ? (
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
          ) : null}
        </div>
      )}
    </Section>
  );
}
