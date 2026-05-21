"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus, Send } from "lucide-react";
import { tokenHasWhatsAppAccess } from "@related/shared";
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
  whatsappGroupId: string | null;
  members: GroupMember[];
  onGroupIdResolved?: (groupId: string) => void;
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

export function GroupWhatsAppSection({
  groupId,
  groupName,
  whatsappGroupId: initialGroupId,
  members,
  onGroupIdResolved,
}: Props) {
  const [whatsappConnected, setWhatsappConnected] = useState<boolean | null>(
    null,
  );
  const [whatsappGroupId, setWhatsappGroupId] = useState(initialGroupId);
  const [messages, setMessages] = useState<
    Awaited<
      ReturnType<
        ReturnType<typeof getBrowserDeps>["whatsapp"]["listForGroup"]
      >
    >["messages"]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const memberPhones = members
    .map((m) => m.phone)
    .filter((p): p is string => Boolean(p));
  const membersWithPhone = members.filter((m) => m.phone);

  useEffect(() => {
    setWhatsappGroupId(initialGroupId);
  }, [initialGroupId]);

  const checkWhatsAppConnection = useCallback(async () => {
    const { userProviderTokens } = getBrowserDeps();
    const token = await userProviderTokens.getForProvider("whatsapp");
    setWhatsappConnected(
      token !== null && tokenHasWhatsAppAccess(token.scopes),
    );
  }, []);

  const loadMessages = useCallback(async () => {
    if (membersWithPhone.length === 0 && !whatsappGroupId) return;
    setLoading(true);
    setError(null);
    try {
      const { whatsapp } = getBrowserDeps();
      const result = await whatsapp.listForGroup({
        groupId,
        whatsappGroupId,
        memberPhones,
        maxResults: 25,
      });

      if (
        result.status === "no_token" ||
        result.status === "needs_whatsapp_scopes"
      ) {
        setWhatsappConnected(false);
        setMessages([]);
        return;
      }
      if (result.status === "needs_reconsent") {
        setWhatsappConnected(false);
        setError("WhatsApp access expired — reconnect in Settings.");
        setMessages([]);
        return;
      }
      if (result.status === "error") {
        setError("Could not load WhatsApp group messages.");
        return;
      }

      setWhatsappConnected(true);
      setMessages(result.messages);

      if (
        result.resolvedGroupId &&
        result.resolvedGroupId !== whatsappGroupId
      ) {
        setWhatsappGroupId(result.resolvedGroupId);
        onGroupIdResolved?.(result.resolvedGroupId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [
    groupId,
    whatsappGroupId,
    memberPhones,
    membersWithPhone.length,
    onGroupIdResolved,
  ]);

  useEffect(() => {
    void checkWhatsAppConnection();
  }, [checkWhatsAppConnection]);

  useEffect(() => {
    if (whatsappConnected && (membersWithPhone.length > 0 || whatsappGroupId)) {
      void loadMessages();
    }
  }, [whatsappConnected, membersWithPhone.length, whatsappGroupId, loadMessages]);

  async function sendMessage() {
    if (!whatsappGroupId || sending) return;
    const trimmedBody = body.trim();
    if (!trimmedBody) return;

    setSending(true);
    setError(null);
    try {
      const { whatsapp } = getBrowserDeps();
      const result = await whatsapp.sendGroup({
        groupId,
        whatsappGroupId,
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

  const canSend = Boolean(whatsappGroupId && whatsappConnected);

  return (
    <Section
      title="WhatsApp"
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
      {membersWithPhone.length === 0 ? (
        <EmptyState
          title="No phone numbers on file"
          description={`Add phone numbers to ${groupName} members in their relationship pages to find your WhatsApp group chat.`}
        />
      ) : whatsappConnected === null ? (
        <p className="text-[13px] text-fg-muted">Checking WhatsApp connection…</p>
      ) : !whatsappConnected ? (
        <EmptyState
          title="WhatsApp not connected"
          description="Connect your WhatsApp Business account in Settings to read and send group messages."
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
          {!whatsappGroupId ? (
            <p className="text-[13px] text-fg-muted">
              No WhatsApp group found yet. Send or receive a group message on
              WhatsApp with these members, then refresh — or configure the Meta
              webhook to sync inbound group messages.
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
                whatsappGroupId
                  ? `No WhatsApp group messages found for ${groupName}. Send one to start the thread.`
                  : "Waiting to find a WhatsApp group conversation."
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
                          {m.fromName ??
                            (m.fromPhone ? `+${m.fromPhone}` : "Unknown")}
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
