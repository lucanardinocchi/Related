import type { RelayConfig } from "./config.js";
import { sendMessage } from "./imsg.js";
import { relayFetch } from "./sync.js";

export interface OutboundQueueItem {
  id: string;
  body: string;
  threadId?: string;
  externalChatId?: string;
  contactPhone?: string;
  participantHandles?: string[];
}

export interface OutboundPullResponse {
  items: OutboundQueueItem[];
}

export interface OutboundAckBody {
  id: string;
  status: "sent" | "failed";
  externalMessageId?: string;
  externalChatId?: string;
  error?: string;
  sentAt?: string;
}

export async function pullOutbound(config: RelayConfig): Promise<OutboundQueueItem[]> {
  const response = await relayFetch<OutboundPullResponse>(
    config,
    "relay-outbound-pull",
    {},
  );
  return response.items ?? [];
}

export async function ackOutbound(
  config: RelayConfig,
  ack: OutboundAckBody,
): Promise<void> {
  await relayFetch(config, "relay-outbound-ack", ack);
}

export async function processOutboundItem(
  config: RelayConfig,
  item: OutboundQueueItem,
): Promise<void> {
  try {
    const groupRecipients = item.participantHandles?.filter(Boolean) ?? [];
    const to =
      item.externalChatId || groupRecipients.length > 0
        ? undefined
        : item.contactPhone;

    const sent = await sendMessage({
      chatId: item.externalChatId,
      to:
        groupRecipients.length > 0
          ? groupRecipients.join(",")
          : to,
      body: item.body,
    });

    const externalChatId =
      sent?.chat_id !== undefined
        ? String(sent.chat_id)
        : item.externalChatId;

    await ackOutbound(config, {
      id: item.id,
      status: "sent",
      externalMessageId:
        sent?.guid ?? (sent?.id !== undefined ? String(sent.id) : undefined),
      externalChatId,
      sentAt: sent?.created_at ?? new Date().toISOString(),
    });
  } catch (err) {
    await ackOutbound(config, {
      id: item.id,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function drainOutbound(config: RelayConfig): Promise<number> {
  const items = await pullOutbound(config);
  for (const item of items) {
    await processOutboundItem(config, item);
  }
  return items.length;
}
