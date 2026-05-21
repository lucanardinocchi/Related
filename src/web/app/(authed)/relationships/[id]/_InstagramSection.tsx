"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus, Send } from "lucide-react";
import { tokenHasInstagramAccess } from "@related/shared";
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
  instagramUsername: string | null;
  instagramScopedId: string | null;
  onScopedIdResolved?: (scopedId: string) => void;
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

export function InstagramSection({
  contactId,
  contactName,
  instagramUsername,
  instagramScopedId: initialScopedId,
  onScopedIdResolved,
}: Props) {
  const [instagramConnected, setInstagramConnected] = useState<boolean | null>(
    null,
  );
  const [scopedId, setScopedId] = useState(initialScopedId);
  const [messages, setMessages] = useState<
    Awaited<
      ReturnType<
        ReturnType<typeof getBrowserDeps>["instagram"]["listForContact"]
      >
    >["messages"]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setScopedId(initialScopedId);
  }, [initialScopedId]);

  const checkInstagramConnection = useCallback(async () => {
    const { userProviderTokens } = getBrowserDeps();
    const token = await userProviderTokens.getForProvider("instagram");
    setInstagramConnected(
      token !== null && tokenHasInstagramAccess(token.scopes),
    );
  }, []);

  const loadMessages = useCallback(async () => {
    if (!instagramUsername && !scopedId) return;
    setLoading(true);
    setError(null);
    try {
      const { instagram } = getBrowserDeps();
      const result = await instagram.listForContact({
        contactId,
        instagramUsername,
        instagramScopedId: scopedId,
        maxResults: 25,
      });

      if (
        result.status === "no_token" ||
        result.status === "needs_instagram_scopes"
      ) {
        setInstagramConnected(false);
        setMessages([]);
        return;
      }
      if (result.status === "needs_reconsent") {
        setInstagramConnected(false);
        setError("Instagram access expired — reconnect in Settings.");
        setMessages([]);
        return;
      }
      if (result.status === "error") {
        setError("Could not load Instagram messages.");
        return;
      }

      setInstagramConnected(true);
      setMessages(result.messages);

      if (result.resolvedScopedId && result.resolvedScopedId !== scopedId) {
        setScopedId(result.resolvedScopedId);
        onScopedIdResolved?.(result.resolvedScopedId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load messages.");
    } finally {
      setLoading(false);
    }
  }, [
    contactId,
    instagramUsername,
    scopedId,
    onScopedIdResolved,
  ]);

  useEffect(() => {
    void checkInstagramConnection();
  }, [checkInstagramConnection]);

  useEffect(() => {
    if (instagramConnected && (instagramUsername || scopedId)) {
      void loadMessages();
    }
  }, [instagramConnected, instagramUsername, scopedId, loadMessages]);

  async function sendMessage() {
    if (!scopedId || sending) return;
    const trimmedBody = body.trim();
    if (!trimmedBody) return;

    setSending(true);
    setError(null);
    try {
      const { instagram } = getBrowserDeps();
      const result = await instagram.send({
        contactId,
        instagramScopedId: scopedId,
        text: trimmedBody,
      });
      if (result.status !== "ok") {
        setError(
          "Could not send message — you can only reply within 24 hours of them messaging you.",
        );
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

  const hasIdentifier = Boolean(instagramUsername || scopedId);
  const canSend = hasIdentifier && instagramConnected && scopedId;

  return (
    <Section
      title="Instagram"
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
          title="No Instagram handle on file"
          description={`Add ${contactName}'s Instagram username in Key details to see your DM thread here.`}
        />
      ) : instagramConnected === null ? (
        <p className="text-[13px] text-fg-muted">
          Checking Instagram connection…
        </p>
      ) : !instagramConnected ? (
        <EmptyState
          title="Instagram not connected"
          description="Connect your Instagram creator account in Settings to read and send DMs."
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
          {!scopedId ? (
            <p className="text-[13px] text-fg-muted">
              No conversation found yet with{" "}
              {instagramUsername ? `@${instagramUsername.replace(/^@/, "")}` : "this contact"}.
              They need to message your Instagram account first — then refresh this page.
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
                scopedId
                  ? `No Instagram DMs found with ${contactName}. Send one to start the thread.`
                  : "Waiting for them to message you on Instagram."
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
