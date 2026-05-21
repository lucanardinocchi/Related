"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  type CommsTimelineItem,
  fromGmailMessage,
  fromImessageMessage,
  fromInstagramMessage,
  fromCommsPlatformMessage,
  fromTikTokMessage,
  fromTikTokRow,
  fromWhatsAppMessage,
  fromWhatsAppRow,
  fromXMessage,
  mergeCommsTimelineItems,
  tokenHasGmailAccess,
  tokenHasInstagramAccess,
  tokenHasTikTokAccess,
  tokenHasWhatsAppAccess,
  tokenHasXAccess,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import { EmptyState, Section } from "@/components/ui";
import { fmtDay, fmtTime } from "./_dateFormat";
import { CommsPlatformIcon } from "./_commsIcons";

interface ContactIdentifiers {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  instagramUsername: string | null;
  instagramScopedId: string | null;
  xUsername: string | null;
  xUserId: string | null;
  tiktokUsername: string | null;
  tiktokOpenId: string | null;
  whatsappWaId: string | null;
}

interface Props {
  contact: ContactIdentifiers;
  onInstagramScopedIdResolved?: (scopedId: string) => void;
  onXUserIdResolved?: (userId: string) => void;
  onWhatsappWaIdResolved?: (waId: string) => void;
  onTikTokOpenIdResolved?: (openId: string) => void;
}

function deriveWaId(waId: string | null, phone: string | null): string | null {
  if (waId) return waId;
  if (!phone) return null;
  const digits = phone.trim().replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function hasAnyContactIdentifier(contact: ContactIdentifiers): boolean {
  return Boolean(
    contact.phone ||
      contact.email ||
      contact.instagramUsername ||
      contact.instagramScopedId ||
      contact.xUsername ||
      contact.xUserId ||
      contact.tiktokUsername ||
      contact.tiktokOpenId ||
      deriveWaId(contact.whatsappWaId, contact.phone),
  );
}

export function CommsSection({
  contact,
  onInstagramScopedIdResolved,
  onXUserIdResolved,
  onWhatsappWaIdResolved,
  onTikTokOpenIdResolved,
}: Props) {
  const [items, setItems] = useState<CommsTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadComms = useCallback(async () => {
    setLoading(true);
    const collected: CommsTimelineItem[] = [];
    const {
      supabase,
      messages: messagesClient,
      gmail,
      instagram,
      x,
      whatsapp,
      tiktok,
      userProviderTokens,
    } = getBrowserDeps();

    const seen = new Set<string>();
    function addItems(next: CommsTimelineItem[]) {
      for (const item of next) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        collected.push(item);
      }
    }

    async function loadCachedPlatformMessages() {
      const { data, error } = await supabase
        .from("comms_platform_messages")
        .select(
          "platform, external_id, direction, body, subject, snippet, sent_at",
        )
        .eq("contact_id", contact.id)
        .order("sent_at", { ascending: false })
        .limit(100);
      if (error || !data) return;
      addItems(data.map((row) => fromCommsPlatformMessage(row)));
    }

    async function loadCachedWhatsApp() {
      const { data, error } = await supabase
        .from("whatsapp_messages")
        .select("wa_message_id, direction, text, sent_at")
        .eq("contact_id", contact.id)
        .order("sent_at", { ascending: false })
        .limit(100);
      if (error || !data) return;
      addItems(data.map((row) => fromWhatsAppRow(row)));
    }

    async function loadCachedTikTok() {
      const { data, error } = await supabase
        .from("tiktok_messages")
        .select("tiktok_message_id, direction, text, sent_at")
        .eq("contact_id", contact.id)
        .order("sent_at", { ascending: false })
        .limit(100);
      if (error || !data) return;
      addItems(data.map((row) => fromTikTokRow(row)));
    }

    const loaders: Array<Promise<void>> = [
      loadCachedPlatformMessages(),
      loadCachedWhatsApp(),
      loadCachedTikTok(),
    ];

    if (contact.phone) {
      loaders.push(
        (async () => {
          try {
            const threads = await messagesClient.listThreadsForContact(
              contact.id,
            );
            const messageLists = await Promise.all(
              threads.map((thread) => messagesClient.listMessages(thread.id)),
            );
            for (const list of messageLists) {
              for (const message of list) {
                addItems([fromImessageMessage(message)]);
              }
            }
          } catch {
            // Relay or cache unavailable — skip iMessage/SMS.
          }
        })(),
      );
    }

    if (contact.email) {
      loaders.push(
        (async () => {
          try {
            const token = await userProviderTokens.getForProvider("google");
            if (!token || !tokenHasGmailAccess(token.scopes)) return;
            const result = await gmail.listForContact({
              contactEmail: contact.email!,
              maxResults: 25,
            });
            if (result.status !== "ok") return;
            addItems(result.messages.map((message) => fromGmailMessage(message)));
          } catch {
            // Gmail unavailable — skip.
          }
        })(),
      );
    }

    if (contact.instagramUsername || contact.instagramScopedId) {
      loaders.push(
        (async () => {
          try {
            const token = await userProviderTokens.getForProvider("instagram");
            if (!token || !tokenHasInstagramAccess(token.scopes)) return;
            const result = await instagram.listForContact({
              contactId: contact.id,
              instagramUsername: contact.instagramUsername,
              instagramScopedId: contact.instagramScopedId,
              maxResults: 25,
            });
            if (result.status !== "ok") return;
            addItems(result.messages.map((message) => fromInstagramMessage(message)));
            if (result.resolvedScopedId) {
              onInstagramScopedIdResolved?.(result.resolvedScopedId);
            }
          } catch {
            // Instagram unavailable — skip.
          }
        })(),
      );
    }

    if (contact.xUsername || contact.xUserId) {
      loaders.push(
        (async () => {
          try {
            const token = await userProviderTokens.getForProvider("x");
            if (!token || !tokenHasXAccess(token.scopes)) return;
            const result = await x.listForContact({
              contactId: contact.id,
              xUsername: contact.xUsername,
              xUserId: contact.xUserId,
              maxResults: 25,
            });
            if (result.status !== "ok") return;
            addItems(result.messages.map((message) => fromXMessage(message)));
            if (result.resolvedUserId) {
              onXUserIdResolved?.(result.resolvedUserId);
            }
          } catch {
            // X unavailable — skip.
          }
        })(),
      );
    }

    const effectiveWaId = deriveWaId(contact.whatsappWaId, contact.phone);
    if (effectiveWaId) {
      loaders.push(
        (async () => {
          try {
            const token = await userProviderTokens.getForProvider("whatsapp");
            if (!token || !tokenHasWhatsAppAccess(token.scopes)) return;
            const result = await whatsapp.listForContact({
              contactId: contact.id,
              phone: contact.phone,
              whatsappWaId: effectiveWaId,
              maxResults: 25,
            });
            if (result.status !== "ok") return;
            addItems(result.messages.map((message) => fromWhatsAppMessage(message)));
            if (result.resolvedWaId) {
              onWhatsappWaIdResolved?.(result.resolvedWaId);
            }
          } catch {
            // WhatsApp unavailable — skip.
          }
        })(),
      );
    }

    if (contact.tiktokUsername || contact.tiktokOpenId) {
      loaders.push(
        (async () => {
          try {
            const token = await userProviderTokens.getForProvider("tiktok");
            if (!token || !tokenHasTikTokAccess(token.scopes)) return;
            const result = await tiktok.listForContact({
              contactId: contact.id,
              tiktokUsername: contact.tiktokUsername,
              tiktokOpenId: contact.tiktokOpenId,
              maxResults: 25,
            });
            if (result.status !== "ok") return;
            addItems(result.messages.map((message) => fromTikTokMessage(message)));
            if (result.resolvedOpenId) {
              onTikTokOpenIdResolved?.(result.resolvedOpenId);
            }
          } catch {
            // TikTok unavailable — skip.
          }
        })(),
      );
    }

    await Promise.allSettled(loaders);
    setItems(mergeCommsTimelineItems(collected));
    setLoading(false);
  }, [
    contact,
    onInstagramScopedIdResolved,
    onTikTokOpenIdResolved,
    onWhatsappWaIdResolved,
    onXUserIdResolved,
  ]);

  useEffect(() => {
    void loadComms();
  }, [loadComms]);

  const hasIdentifiers = hasAnyContactIdentifier(contact);

  return (
    <Section
      title="Comms"
      meta={
        items.length > 0
          ? `${items.length} message${items.length === 1 ? "" : "s"}`
          : undefined
      }
    >
      {!hasIdentifiers ? (
        <EmptyState
          title="No contact channels on file"
          description={`Add ${contact.name}'s phone, email, or social handles in Key details to see messages here.`}
        />
      ) : loading ? (
        <p className="text-[13px] text-fg-muted">Loading comms…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="No messages yet"
          description={`No synced messages with ${contact.name}. Connect integrations in Settings and add contact details above.`}
          action={
            <Link href="/settings" className="text-[13px] text-accent hover:underline">
              Go to Settings
            </Link>
          }
        />
      ) : (
        <ol className="divide-y divide-divider">
          {items.map((item) => (
            <CommsTimelineRow key={item.id} item={item} />
          ))}
        </ol>
      )}
    </Section>
  );
}

function CommsTimelineRow({ item }: { item: CommsTimelineItem }) {
  if (item.platform === "email") {
    return <EmailCommsRow item={item} />;
  }
  return <StandardCommsRow item={item} />;
}

function StandardCommsRow({ item }: { item: CommsTimelineItem }) {
  return (
    <li className="grid grid-cols-[150px_1fr] items-start gap-4 py-3 first:pt-0 last:pb-0">
      <div className="select-none pt-[1px] font-[family-name:var(--font-jetbrains-mono)] text-[12px] leading-[18px] tabular-nums text-fg-muted">
        <div>{fmtDay(item.sentAt)}</div>
        <div className="text-fg-subtle">{fmtTime(item.sentAt)}</div>
      </div>
      <div className="min-w-0">
        <div className="flex items-start gap-2.5">
          <CommsPlatformIcon platform={item.platform} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <DirectionBadge direction={item.direction} />
            </div>
            <p className="mt-1 whitespace-pre-wrap text-[13px] text-fg">
              {item.body}
            </p>
          </div>
        </div>
      </div>
    </li>
  );
}

function EmailCommsRow({ item }: { item: CommsTimelineItem }) {
  const [expanded, setExpanded] = useState(false);
  const [loadingBody, setLoadingBody] = useState(false);
  const [fullBody, setFullBody] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (item.emailFullBody) {
      setFullBody(item.emailFullBody);
      return;
    }
    if (
      next &&
      item.emailMessageId &&
      fullBody === null &&
      !loadingBody
    ) {
      setLoadingBody(true);
      setLoadError(null);
      try {
        const { gmail } = getBrowserDeps();
        const result = await gmail.getMessage(item.emailMessageId);
        if (result.status !== "ok" || !result.message) {
          setLoadError("Could not load email body.");
        } else {
          setFullBody(result.message.body);
        }
      } catch {
        setLoadError("Could not load email body.");
      } finally {
        setLoadingBody(false);
      }
    }
  }

  const preview = item.snippet || item.subject || item.body;

  return (
    <li className="grid grid-cols-[150px_1fr] items-start gap-4 py-3 first:pt-0 last:pb-0">
      <div className="select-none pt-[1px] font-[family-name:var(--font-jetbrains-mono)] text-[12px] leading-[18px] tabular-nums text-fg-muted">
        <div>{fmtDay(item.sentAt)}</div>
        <div className="text-fg-subtle">{fmtTime(item.sentAt)}</div>
      </div>
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => void toggleExpanded()}
          className="flex w-full items-start gap-2.5 rounded-md text-left transition-colors hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          aria-expanded={expanded}
        >
          <CommsPlatformIcon platform="email" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <DirectionBadge direction={item.direction} />
                  {expanded ? (
                    <ChevronDown size={14} className="text-fg-subtle" />
                  ) : (
                    <ChevronRight size={14} className="text-fg-subtle" />
                  )}
                </div>
                <p className="mt-1 truncate text-[13px] font-medium text-fg">
                  {item.subject ?? "(no subject)"}
                </p>
                {!expanded && preview ? (
                  <p className="mt-0.5 line-clamp-2 text-[13px] text-fg-muted">
                    {preview}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </button>
        {expanded ? (
          <div className="ml-[30px] mt-2 space-y-2 border-l border-divider pl-3">
            {loadingBody ? (
              <p className="text-[13px] text-fg-muted">Loading body…</p>
            ) : loadError ? (
              <p className="text-[13px] text-danger">{loadError}</p>
            ) : (
              <p className="whitespace-pre-wrap text-[13px] text-fg">
                {fullBody ?? preview}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function DirectionBadge({
  direction,
}: {
  direction: CommsTimelineItem["direction"];
}) {
  return (
    <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-fg-subtle">
      {direction === "sent" ? "Sent" : "Received"}
    </span>
  );
}
