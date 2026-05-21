"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { fmtCommsSentAt } from "./_dateFormat";
import { CommsPlatformIcon } from "./_commsIcons";

const INITIAL_VISIBLE = 24;
const LOAD_MORE_BATCH = 24;
const MIN_GAP_PX = 14;
const MAX_GAP_PX = 112;
const LOAD_MORE_GAP_PX = 40;

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

/** Map elapsed time between messages to vertical spacing on the spine. */
function gapPxBetween(sentAtA: string, sentAtB: string): number {
  const a = new Date(sentAtA).getTime();
  const b = new Date(sentAtB).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return MIN_GAP_PX;

  const deltaMs = Math.abs(b - a);
  const minutes = deltaMs / 60_000;

  if (minutes < 3) return MIN_GAP_PX;
  if (minutes < 30) return MIN_GAP_PX + ((minutes - 3) / 27) * 18;
  if (minutes < 180) return 32 + ((minutes - 30) / 150) * 24;

  const hours = minutes / 60;
  if (hours < 24) return 56 + (hours / 24) * 28;

  const days = hours / 24;
  return Math.min(MAX_GAP_PX, 84 + days * 10);
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
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

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
    setVisibleCount(INITIAL_VISIBLE);
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

  // mergeCommsTimelineItems already returns newest-first.
  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount],
  );

  const gaps = useMemo(() => {
    const next: number[] = [];
    for (let i = 0; i < visibleItems.length - 1; i += 1) {
      next.push(
        gapPxBetween(visibleItems[i + 1]!.sentAt, visibleItems[i]!.sentAt),
      );
    }
    return next;
  }, [visibleItems]);

  const hasMore = visibleCount < items.length;
  const hiddenCount = items.length - visibleItems.length;
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
        <CommsSpine
          contactName={contact.name}
          gaps={gaps}
          hasMore={hasMore}
          hiddenCount={hiddenCount}
          items={visibleItems}
          onLoadMore={() =>
            setVisibleCount((count) =>
              Math.min(count + LOAD_MORE_BATCH, items.length),
            )
          }
        />
      )}
    </Section>
  );
}

function CommsSpine({
  contactName,
  items,
  gaps,
  hasMore,
  hiddenCount,
  onLoadMore,
}: {
  contactName: string;
  items: CommsTimelineItem[];
  gaps: number[];
  hasMore: boolean;
  hiddenCount: number;
  onLoadMore: () => void;
}) {
  return (
    <div className="relative mx-auto max-w-xl py-2">
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2 bg-border-strong"
      />

      <ol className="relative z-10 list-none">
        {items.map((item, index) => (
          <li key={item.id}>
            <CommsSpineNode contactName={contactName} item={item} />
            {index < items.length - 1 ? (
              <div style={{ height: gaps[index] }} aria-hidden />
            ) : null}
          </li>
        ))}
      </ol>

      {hasMore ? (
        <div className="relative z-10 flex flex-col items-center">
          <div style={{ height: LOAD_MORE_GAP_PX }} aria-hidden />
          <button
            type="button"
            onClick={onLoadMore}
            className="rounded-full border border-border-strong bg-surface px-3 py-1 font-[family-name:var(--font-jetbrains-mono)] text-[15px] leading-none tracking-[0.35em] text-fg-muted transition-colors hover:border-fg-subtle hover:bg-hover hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            aria-label={`Load ${Math.min(hiddenCount, LOAD_MORE_BATCH)} older messages`}
          >
            ···
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PlatformIconBadge({ platform }: { platform: CommsTimelineItem["platform"] }) {
  return (
    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center text-fg-muted">
      <CommsPlatformIcon platform={platform} />
    </div>
  );
}

const SPINE_GAP_CLASS = "gap-x-4";
/** Half spine column (0.625rem) + gap-x-4 (1rem), center of circle → card edge */
const CONNECTOR_WIDTH = "calc(0.3125rem + 1rem)";

function CommsSpineNode({
  item,
  contactName,
}: {
  item: CommsTimelineItem;
  contactName: string;
}) {
  const fromContact = item.direction === "received";

  return (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_0.625rem_minmax(0,1fr)] items-start ${SPINE_GAP_CLASS}`}
    >
      <div className="min-w-0">
        {fromContact ? (
          <div className="flex justify-end gap-2">
            <PlatformIconBadge platform={item.platform} />
            <MessageCard contactName={contactName} item={item} side="left" />
          </div>
        ) : null}
      </div>

      <div className="flex justify-center self-start pt-[1.125rem]">
        <div className="relative h-2.5 w-2.5 shrink-0">
          <div
            aria-hidden
            className={`absolute top-1/2 h-px -translate-y-1/2 bg-border-strong ${
              fromContact
                ? "right-1/2"
                : "left-1/2"
            }`}
            style={{ width: CONNECTOR_WIDTH }}
          />
          <div
            aria-hidden
            className="relative z-10 h-2.5 w-2.5 rounded-full border-2 border-border-strong bg-surface shadow-[0_0_0_4px_var(--color-surface)]"
          />
        </div>
      </div>

      <div className="min-w-0">
        {!fromContact ? (
          <div className="flex justify-start gap-2">
            <MessageCard contactName={contactName} item={item} side="right" />
            <PlatformIconBadge platform={item.platform} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MessageCard({
  item,
  contactName,
  side,
}: {
  item: CommsTimelineItem;
  contactName: string;
  side: "left" | "right";
}) {
  if (item.platform === "email") {
    return <EmailMessageCard item={item} side={side} />;
  }

  return (
    <div className="max-w-[min(100%,16rem)] rounded-lg border border-border bg-surface px-3 py-2 text-left">
      <p className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle">
        {side === "left" ? contactName : "You"}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-[13px] leading-[1.45] text-fg">
        {item.body}
      </p>
      <time
        className={`mt-2 block font-[family-name:var(--font-jetbrains-mono)] text-[10px] tabular-nums text-fg-subtle ${
          side === "left" ? "text-left" : "text-right"
        }`}
      >
        {fmtCommsSentAt(item.sentAt)}
      </time>
    </div>
  );
}

function EmailMessageCard({
  item,
  side,
}: {
  item: CommsTimelineItem;
  side: "left" | "right";
}) {
  const [expanded, setExpanded] = useState(false);
  const [loadingBody, setLoadingBody] = useState(false);
  const [fullBody, setFullBody] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const preview = item.snippet || item.subject || item.body;

  async function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    if (item.emailFullBody) {
      setFullBody(item.emailFullBody);
      return;
    }
    if (next && item.emailMessageId && fullBody === null && !loadingBody) {
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

  return (
    <div className="max-w-[min(100%,18rem)] rounded-lg border border-border bg-surface text-left">
      <button
        type="button"
        onClick={() => void toggleExpanded()}
        className="w-full px-3 py-2 text-left transition-colors hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        aria-expanded={expanded}
      >
        <div className="flex items-start gap-1.5">
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">
            {item.subject ?? "(no subject)"}
          </p>
          {expanded ? (
            <ChevronDown size={14} className="mt-0.5 shrink-0 text-fg-subtle" />
          ) : (
            <ChevronRight size={14} className="mt-0.5 shrink-0 text-fg-subtle" />
          )}
        </div>
        {!expanded && preview ? (
          <p className="mt-0.5 line-clamp-2 text-[12px] text-fg-muted">{preview}</p>
        ) : null}
      </button>
      {expanded ? (
        <div className="border-t border-divider px-3 py-2">
          {loadingBody ? (
            <p className="text-[12px] text-fg-muted">Loading body…</p>
          ) : loadError ? (
            <p className="text-[12px] text-danger">{loadError}</p>
          ) : (
            <p className="whitespace-pre-wrap text-[12px] leading-[1.5] text-fg">
              {fullBody ?? preview}
            </p>
          )}
        </div>
      ) : null}
      <div
        className={`border-t border-divider px-3 py-1.5 ${
          side === "left" ? "text-left" : "text-right"
        }`}
      >
        <time className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] tabular-nums text-fg-subtle">
          {fmtCommsSentAt(item.sentAt)}
        </time>
      </div>
    </div>
  );
}
