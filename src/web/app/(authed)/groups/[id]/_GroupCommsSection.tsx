"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type CommsTimelineItem,
  fromTikTokRow,
  fromXRow,
  fromWhatsAppRow,
  mergeCommsTimelineItems,
  tokenHasTikTokAccess,
  tokenHasWhatsAppAccess,
  tokenHasXAccess,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import { EmptyState, Section } from "@/components/ui";
import { fmtCommsSentAt } from "../../relationships/[id]/_dateFormat";
import { CommsPlatformIcon } from "../../relationships/[id]/_commsIcons";
import {
  CommsComposeBar,
  type AvailablePlatform,
  type ComposePlatform,
} from "../../relationships/[id]/_CommsComposeBar";

interface GroupMember {
  id: string;
  name: string;
  phone: string | null;
  xUsername: string | null;
  xUserId: string | null;
  tiktokUsername: string | null;
  tiktokOpenId: string | null;
}

interface Props {
  groupId: string;
  groupName: string;
  members: GroupMember[];
  xDmConversationId: string | null;
  whatsappGroupId: string | null;
  tiktokDmConversationId: string | null;
  onXConversationIdResolved?: (conversationId: string) => void;
  onWhatsAppGroupIdResolved?: (groupId: string) => void;
  onTikTokConversationIdResolved?: (conversationId: string) => void;
}

export function GroupCommsSection({
  groupId,
  groupName,
  members,
  xDmConversationId: initialXConvId,
  whatsappGroupId: initialWaGroupId,
  tiktokDmConversationId: initialTtConvId,
  onXConversationIdResolved,
  onWhatsAppGroupIdResolved,
  onTikTokConversationIdResolved,
}: Props) {
  const [items, setItems] = useState<CommsTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [xConvId, setXConvId] = useState(initialXConvId);
  const [waGroupId, setWaGroupId] = useState(initialWaGroupId);
  const [ttConvId, setTtConvId] = useState(initialTtConvId);
  const [connected, setConnected] = useState({
    whatsapp: false,
    x: false,
    tiktok: false,
  });
  const [relayOnline, setRelayOnline] = useState<boolean | null>(null);

  useEffect(() => setXConvId(initialXConvId), [initialXConvId]);
  useEffect(() => setWaGroupId(initialWaGroupId), [initialWaGroupId]);
  useEffect(() => setTtConvId(initialTtConvId), [initialTtConvId]);

  const memberPhones = useMemo(
    () => members.map((m) => m.phone).filter((p): p is string => !!p),
    [members],
  );
  const memberXUserIds = useMemo(
    () => members.map((m) => m.xUserId).filter((id): id is string => !!id),
    [members],
  );
  const memberTikTokOpenIds = useMemo(
    () =>
      members.map((m) => m.tiktokOpenId).filter((id): id is string => !!id),
    [members],
  );

  const loadComms = useCallback(async () => {
    setLoading(true);
    const collected: CommsTimelineItem[] = [];
    const seen = new Set<string>();
    function addItems(next: CommsTimelineItem[]) {
      for (const it of next) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        collected.push(it);
      }
    }
    const {
      supabase,
      messages: messagesClient,
      whatsapp,
      x,
      tiktok,
      userProviderTokens,
    } = getBrowserDeps();

    try {
      const [waTok, xTok, ttTok] = await Promise.all([
        userProviderTokens.getForProvider("whatsapp"),
        userProviderTokens.getForProvider("x"),
        userProviderTokens.getForProvider("tiktok"),
      ]);
      setConnected({
        whatsapp: !!waTok && tokenHasWhatsAppAccess(waTok.scopes),
        x: !!xTok && tokenHasXAccess(xTok.scopes),
        tiktok: !!ttTok && tokenHasTikTokAccess(ttTok.scopes),
      });
    } catch {
      // tokens unavailable — treat as disconnected
    }

    const loaders: Array<Promise<void>> = [];

    loaders.push(
      (async () => {
        const { data } = await supabase
          .from("whatsapp_messages")
          .select("wa_message_id, direction, text, sent_at")
          .eq("group_id", groupId)
          .order("sent_at", { ascending: false })
          .limit(100);
        if (data) addItems(data.map((row) => fromWhatsAppRow(row)));
      })(),
    );

    loaders.push(
      (async () => {
        const { data } = await supabase
          .from("tiktok_messages")
          .select("tiktok_message_id, direction, text, sent_at")
          .eq("group_id", groupId)
          .order("sent_at", { ascending: false })
          .limit(100);
        if (data) addItems(data.map((row) => fromTikTokRow(row)));
      })(),
    );

    loaders.push(
      (async () => {
        const { data } = await supabase
          .from("x_messages")
          .select("x_message_id, direction, text, sent_at")
          .eq("group_id", groupId)
          .order("sent_at", { ascending: false })
          .limit(100);
        if (data) addItems(data.map((row) => fromXRow(row)));
      })(),
    );

    if (memberPhones.length > 0) {
      loaders.push(
        (async () => {
          try {
            const online = await messagesClient.isRelayOnline();
            setRelayOnline(online);
            const threads = await messagesClient.listThreadsForGroup(groupId);
            for (const thread of threads) {
              const list = await messagesClient.listMessages(thread.id);
              for (const m of list) {
                addItems([
                  {
                    id: `imessage:${m.id}`,
                    platform: "imessage",
                    direction: m.direction === "outbound" ? "sent" : "received",
                    body: m.body,
                    sentAt: m.sentAt,
                  } as CommsTimelineItem,
                ]);
              }
            }
          } catch {
            // relay unavailable — skip
          }
        })(),
      );
    }

    if (memberXUserIds.length > 0 || xConvId) {
      loaders.push(
        (async () => {
          try {
            const result = await x.listForGroup({
              groupId,
              xDmConversationId: xConvId,
              memberXUserIds,
              maxResults: 25,
            });
            if (result.status !== "ok") return;
            for (const m of result.messages) {
              addItems([
                {
                  id: `x:${m.id}`,
                  platform: "x",
                  direction: m.direction,
                  body: m.text ?? "",
                  sentAt: m.sentAt,
                } as CommsTimelineItem,
              ]);
            }
            if (
              result.resolvedConversationId &&
              result.resolvedConversationId !== xConvId
            ) {
              setXConvId(result.resolvedConversationId);
              onXConversationIdResolved?.(result.resolvedConversationId);
            }
          } catch {
            // X unavailable — skip
          }
        })(),
      );
    }

    if (memberPhones.length > 0 || waGroupId) {
      loaders.push(
        (async () => {
          try {
            const result = await whatsapp.listForGroup({
              groupId,
              whatsappGroupId: waGroupId,
              memberPhones,
              maxResults: 25,
            });
            if (result.status !== "ok") return;
            if (
              result.resolvedGroupId &&
              result.resolvedGroupId !== waGroupId
            ) {
              setWaGroupId(result.resolvedGroupId);
              onWhatsAppGroupIdResolved?.(result.resolvedGroupId);
            }
          } catch {
            // WhatsApp unavailable — skip
          }
        })(),
      );
    }

    if (memberTikTokOpenIds.length > 0 || ttConvId) {
      loaders.push(
        (async () => {
          try {
            const result = await tiktok.listForGroup({
              groupId,
              tiktokDmConversationId: ttConvId,
              memberTikTokOpenIds,
              maxResults: 25,
            });
            if (result.status !== "ok") return;
            if (
              result.resolvedConversationId &&
              result.resolvedConversationId !== ttConvId
            ) {
              setTtConvId(result.resolvedConversationId);
              onTikTokConversationIdResolved?.(result.resolvedConversationId);
            }
          } catch {
            // TikTok unavailable — skip
          }
        })(),
      );
    }

    await Promise.allSettled(loaders);
    setItems(mergeCommsTimelineItems(collected));
    setLoading(false);
  }, [
    groupId,
    memberPhones,
    memberXUserIds,
    memberTikTokOpenIds,
    xConvId,
    waGroupId,
    ttConvId,
    onXConversationIdResolved,
    onWhatsAppGroupIdResolved,
    onTikTokConversationIdResolved,
  ]);

  useEffect(() => {
    void loadComms();
  }, [loadComms]);

  useEffect(() => {
    const { supabase } = getBrowserDeps();
    const channel = supabase
      .channel(`group-comms-wa-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_messages",
          filter: `group_id=eq.${groupId}`,
        },
        () => void loadComms(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [groupId, loadComms]);

  useEffect(() => {
    const { supabase } = getBrowserDeps();
    const channel = supabase
      .channel(`group-comms-tt-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "tiktok_messages",
          filter: `group_id=eq.${groupId}`,
        },
        () => void loadComms(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [groupId, loadComms]);

  useEffect(() => {
    const { supabase } = getBrowserDeps();
    const channel = supabase
      .channel(`group-comms-x-${groupId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "x_messages",
          filter: `group_id=eq.${groupId}`,
        },
        () => void loadComms(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [groupId, loadComms]);

  const availablePlatforms = useMemo<AvailablePlatform[]>(() => {
    const out: AvailablePlatform[] = [];
    if (connected.whatsapp && (waGroupId || memberPhones.length > 0)) {
      out.push({
        platform: "whatsapp",
        label: "WhatsApp",
        disabled: !waGroupId,
        disabledReason: !waGroupId
          ? "No WhatsApp group resolved yet."
          : undefined,
      });
    }
    if (connected.x && (xConvId || memberXUserIds.length > 0)) {
      out.push({
        platform: "x",
        label: "X",
        disabled: !xConvId,
        disabledReason: !xConvId
          ? "No X group DM resolved yet."
          : undefined,
      });
    }
    if (connected.tiktok && (ttConvId || memberTikTokOpenIds.length > 0)) {
      out.push({
        platform: "tiktok",
        label: "TikTok",
        disabled: !ttConvId,
        disabledReason: !ttConvId
          ? "No TikTok group DM resolved yet."
          : undefined,
      });
    }
    if (memberPhones.length > 0) {
      out.push({ platform: "imessage", label: "iMessage / SMS" });
    }
    return out;
  }, [
    connected,
    waGroupId,
    xConvId,
    ttConvId,
    memberPhones.length,
    memberXUserIds.length,
    memberTikTokOpenIds.length,
  ]);

  const handleSend = useCallback(
    async (platform: ComposePlatform, text: string) => {
      const deps = getBrowserDeps();
      switch (platform) {
        case "whatsapp": {
          if (!waGroupId) throw new Error("No WhatsApp group resolved.");
          const r = await deps.whatsapp.sendGroup({
            groupId,
            whatsappGroupId: waGroupId,
            text,
          });
          if (r.status !== "ok") throw new Error("Could not send WhatsApp message.");
          break;
        }
        case "x": {
          if (!xConvId) throw new Error("No X group conversation.");
          const r = await deps.x.sendGroup({
            groupId,
            xDmConversationId: xConvId,
            text,
          });
          if (r.status !== "ok") throw new Error("Could not send X group DM.");
          break;
        }
        case "tiktok": {
          if (!ttConvId) throw new Error("No TikTok group conversation.");
          const r = await deps.tiktok.sendGroup({
            groupId,
            tiktokDmConversationId: ttConvId,
            text,
          });
          if (r.status !== "ok") throw new Error("Could not send TikTok group DM.");
          break;
        }
        case "imessage": {
          await deps.messages.sendMessage({ groupId, body: text });
          break;
        }
        case "instagram":
        case "email-gmail":
        case "email-outlook":
          throw new Error("Not available for groups.");
      }
      await loadComms();
    },
    [groupId, waGroupId, xConvId, ttConvId, loadComms],
  );

  const sortedItems = items;
  const hasComms = sortedItems.length > 0;

  return (
    <Section
      title="Comms"
      meta={
        sortedItems.length > 0
          ? `${sortedItems.length} message${sortedItems.length === 1 ? "" : "s"}`
          : undefined
      }
    >
      {relayOnline === false ? (
        <div className="mb-3 rounded-md border border-border bg-surface px-3 py-2 text-[13px] text-fg-muted">
          Mac relay is offline — showing cached messages.{" "}
          <Link href="/settings" className="text-accent hover:underline">
            Check Settings
          </Link>
        </div>
      ) : null}

      {loading ? (
        <p className="text-[13px] text-fg-muted">Loading comms…</p>
      ) : !hasComms ? (
        <EmptyState
          title="No messages yet"
          description={`No synced group messages with ${groupName}. Connect integrations in Settings, then send one to start the thread.`}
        />
      ) : (
        <ul className="divide-y divide-divider">
          {sortedItems.slice(0, 50).map((m) => (
            <li key={m.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 shrink-0 text-fg-muted">
                  <CommsPlatformIcon platform={m.platform} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded bg-surface px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-fg-subtle">
                      {m.direction === "sent" ? "Sent" : "Received"}
                    </span>
                  </div>
                  {m.body ? (
                    <p className="mt-1 whitespace-pre-wrap text-[13px] text-fg">
                      {m.body}
                    </p>
                  ) : null}
                </div>
                <time className="shrink-0 text-[12px] text-fg-subtle">
                  {fmtCommsSentAt(m.sentAt)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}

      {availablePlatforms.length > 0 ? (
        <CommsComposeBar
          availablePlatforms={availablePlatforms}
          onSend={handleSend}
          placeholder={`Message ${groupName}…`}
        />
      ) : null}
    </Section>
  );
}
