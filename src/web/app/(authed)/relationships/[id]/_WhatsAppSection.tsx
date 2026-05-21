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

interface Props {
  contactId: string;
  contactName: string;
  phone: string | null;
  whatsappWaId: string | null;
  onWaIdResolved?: (waId: string) => void;
}

function deriveWaId(
  waId: string | null,
  phone: string | null,
): string | null {
  if (waId) return waId;
  if (!phone) return null;
  const digits = phone.trim().replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
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

export function WhatsAppSection({
  contactId,
  contactName,
  phone,
  whatsappWaId: initialWaId,
  onWaIdResolved,
}: Props) {
  const [whatsappConnected, setWhatsappConnected] = useState<boolean | null>(
    null,
  );
  const [waId, setWaId] = useState(initialWaId);
  const effectiveWaId = deriveWaId(waId, phone);
  const [messages, setMessages] = useState<
    Awaited<
      ReturnType<
        ReturnType<typeof getBrowserDeps>["whatsapp"]["listForContact"]
      >
    >["messages"]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setWaId(initialWaId);
  }, [initialWaId]);

  const checkWhatsAppConnection = useCallback(async () => {
    const { userProviderTokens } = getBrowserDeps();
    const token = await userProviderTokens.getForProvider("whatsapp");
    setWhatsappConnected(
      token !== null && tokenHasWhatsAppAccess(token.scopes),
    );
  }, []);

  const loadMessages = useCallback(async () => {
    if (!phone && !effectiveWaId) return;
    setLoading(true);
    setError(null);
    try {
      const { whatsapp } = getBrowserDeps();
      const result = await whatsapp.listForContact({
        contactId,
        phone,
        whatsappWaId: effectiveWaId,
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
        setError("Could not load WhatsApp messages.");
        return;
      }

      setWhatsappConnected(true);
      setMessages(result.messages);

      if (result.resolvedWaId && result.resolvedWaId !== effectiveWaId) {
        setWaId(result.resolvedWaId);
        onWaIdResolved?.(result.resolvedWaId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [contactId, phone, effectiveWaId, onWaIdResolved]);

  useEffect(() => {
    void checkWhatsAppConnection();
  }, [checkWhatsAppConnection]);

  useEffect(() => {
    if (whatsappConnected && (phone || effectiveWaId)) {
      void loadMessages();
    }
  }, [whatsappConnected, phone, effectiveWaId, loadMessages]);

  async function sendMessage() {
    if (!effectiveWaId || sending) return;
    const trimmedBody = body.trim();
    if (!trimmedBody) return;

    setSending(true);
    setError(null);
    try {
      const { whatsapp } = getBrowserDeps();
      const result = await whatsapp.send({
        contactId,
        whatsappWaId: effectiveWaId,
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

  const hasIdentifier = Boolean(phone || effectiveWaId);
  const canSend = hasIdentifier && whatsappConnected && effectiveWaId;

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
      {!hasIdentifier ? (
        <EmptyState
          title="No phone number on file"
          description={`Add ${contactName}'s phone number in Key details to see your WhatsApp thread here.`}
        />
      ) : whatsappConnected === null ? (
        <p className="text-[13px] text-fg-muted">Checking WhatsApp connection…</p>
      ) : !whatsappConnected ? (
        <EmptyState
          title="WhatsApp not connected"
          description="Connect your WhatsApp Business account in Settings to read and send DMs."
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
          {!effectiveWaId ? (
            <p className="text-[13px] text-fg-muted">
              Could not resolve a WhatsApp ID for {contactName} — check the
              phone number in Key details.
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
                effectiveWaId
                  ? `No WhatsApp messages found with ${contactName}. Send one to start the thread, or configure the Meta webhook to sync inbound messages.`
                  : "Add a valid phone number to load messages."
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
                            (m.fromPhone ? `+${m.fromPhone}` : contactName)}
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
