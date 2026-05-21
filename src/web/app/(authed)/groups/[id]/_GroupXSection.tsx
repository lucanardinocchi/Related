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

interface GroupMember {
  id: string;
  name: string;
  xUsername: string | null;
  xUserId: string | null;
}

interface Props {
  groupId: string;
  groupName: string;
  xDmConversationId: string | null;
  members: GroupMember[];
  onConversationIdResolved?: (conversationId: string) => void;
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

export function GroupXSection({
  groupId,
  groupName,
  xDmConversationId: initialConversationId,
  members,
  onConversationIdResolved,
}: Props) {
  const [xConnected, setXConnected] = useState<boolean | null>(null);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [messages, setMessages] = useState<
    Awaited<
      ReturnType<ReturnType<typeof getBrowserDeps>["x"]["listForGroup"]>
    >["messages"]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const memberXUserIds = members
    .map((m) => m.xUserId)
    .filter((id): id is string => Boolean(id));
  const membersWithX = members.filter((m) => m.xUsername || m.xUserId);

  useEffect(() => {
    setConversationId(initialConversationId);
  }, [initialConversationId]);

  const checkXConnection = useCallback(async () => {
    const { userProviderTokens } = getBrowserDeps();
    const token = await userProviderTokens.getForProvider("x");
    setXConnected(token !== null && tokenHasXAccess(token.scopes));
  }, []);

  const loadMessages = useCallback(async () => {
    if (membersWithX.length === 0 && !conversationId) return;
    setLoading(true);
    setError(null);
    try {
      const { x } = getBrowserDeps();
      const result = await x.listForGroup({
        groupId,
        xDmConversationId: conversationId,
        memberXUserIds,
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
        setError("Could not load X group messages.");
        return;
      }

      setXConnected(true);
      setMessages(result.messages);

      if (
        result.resolvedConversationId &&
        result.resolvedConversationId !== conversationId
      ) {
        setConversationId(result.resolvedConversationId);
        onConversationIdResolved?.(result.resolvedConversationId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [
    groupId,
    conversationId,
    memberXUserIds,
    membersWithX.length,
    onConversationIdResolved,
  ]);

  useEffect(() => {
    void checkXConnection();
  }, [checkXConnection]);

  useEffect(() => {
    if (xConnected && (membersWithX.length > 0 || conversationId)) {
      void loadMessages();
    }
  }, [xConnected, membersWithX.length, conversationId, loadMessages]);

  async function sendMessage() {
    if (!conversationId || sending) return;
    const trimmedBody = body.trim();
    if (!trimmedBody) return;

    setSending(true);
    setError(null);
    try {
      const { x } = getBrowserDeps();
      const result = await x.sendGroup({
        groupId,
        xDmConversationId: conversationId,
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

  const canSend = Boolean(conversationId && xConnected);

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
      {membersWithX.length === 0 ? (
        <EmptyState
          title="No X handles on file"
          description={`Add X usernames to ${groupName} members in their relationship pages to find your group DM.`}
        />
      ) : xConnected === null ? (
        <p className="text-[13px] text-fg-muted">Checking X connection…</p>
      ) : !xConnected ? (
        <EmptyState
          title="X not connected"
          description="Connect your X account in Settings to read and send group DMs."
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
          {!conversationId ? (
            <p className="text-[13px] text-fg-muted">
              No group DM conversation found yet. Start one on X with these
              members, then refresh — or ensure members have X handles saved.
            </p>
          ) : null}

          {composing && (
            <div className="space-y-2 rounded-md border border-border bg-surface p-3">
              <Textarea
                placeholder={`Write to ${groupName}…`}
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
                conversationId
                  ? `No X group DMs found for ${groupName}. Send one to start the thread.`
                  : "Waiting to find a group conversation on X."
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
                            : "Unknown"}
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
