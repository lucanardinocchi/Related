import type { SupabaseClient } from "@supabase/supabase-js";

export interface TikTokMessageSummary {
  id: string;
  text: string;
  fromUsername: string | null;
  sentAt: string;
  direction: "sent" | "received";
}

export interface ListTikTokForContactInput {
  contactId: string;
  tiktokUsername?: string | null;
  tiktokOpenId?: string | null;
  maxResults?: number;
}

export interface SendTikTokInput {
  contactId: string;
  tiktokOpenId: string;
  text: string;
}

export interface ListTikTokForGroupInput {
  groupId: string;
  tiktokDmConversationId?: string | null;
  memberTikTokOpenIds?: string[];
  maxResults?: number;
}

export interface SendTikTokGroupInput {
  groupId: string;
  tiktokDmConversationId: string;
  text: string;
}

export type TikTokContactStatus =
  | "ok"
  | "no_token"
  | "needs_tiktok_scopes"
  | "needs_reconsent"
  | "no_conversation"
  | "error";

interface TikTokDmResponse {
  status?: TikTokContactStatus;
  messages?: TikTokMessageSummary[];
  messageId?: string;
  resolvedOpenId?: string | null;
  resolvedConversationId?: string | null;
  error?: string;
}

/**
 * Client for the tiktok-dm Edge Function — lists and sends TikTok DMs for
 * Contacts and Groups using the User's linked TikTok Business account.
 */
export class TikTokClient {
  constructor(private readonly client: SupabaseClient) {}

  async listForContact(
    input: ListTikTokForContactInput,
  ): Promise<{
    status: TikTokContactStatus;
    messages: TikTokMessageSummary[];
    resolvedOpenId: string | null;
  }> {
    const data = await this.invoke({ action: "list", ...input });
    return {
      status: data.status ?? "error",
      messages: data.messages ?? [],
      resolvedOpenId: data.resolvedOpenId ?? null,
    };
  }

  async send(
    input: SendTikTokInput,
  ): Promise<{ status: TikTokContactStatus; messageId: string | null }> {
    const data = await this.invoke({ action: "send", ...input });
    return {
      status: data.status ?? "error",
      messageId: data.messageId ?? null,
    };
  }

  async listForGroup(
    input: ListTikTokForGroupInput,
  ): Promise<{
    status: TikTokContactStatus;
    messages: TikTokMessageSummary[];
    resolvedConversationId: string | null;
  }> {
    const data = await this.invoke({ action: "listGroup", ...input });
    return {
      status: data.status ?? "error",
      messages: data.messages ?? [],
      resolvedConversationId: data.resolvedConversationId ?? null,
    };
  }

  async sendGroup(
    input: SendTikTokGroupInput,
  ): Promise<{ status: TikTokContactStatus; messageId: string | null }> {
    const data = await this.invoke({ action: "sendGroup", ...input });
    return {
      status: data.status ?? "error",
      messageId: data.messageId ?? null,
    };
  }

  async exchangeOAuthCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<{ status: "ok" | "error"; error?: string }> {
    const { data, error } = await this.client.functions.invoke("tiktok-oauth", {
      body: input,
    });
    if (error) {
      const errMsg =
        (error as { message?: string }).message ?? "tiktok-oauth failed";
      throw new Error(errMsg);
    }
    const result = (data ?? {}) as { status?: string; error?: string };
    if (result.status === "ok") return { status: "ok" };
    return { status: "error", error: result.error ?? "OAuth exchange failed" };
  }

  private async invoke(
    body: Record<string, unknown>,
  ): Promise<TikTokDmResponse> {
    const { data, error } = await this.client.functions.invoke("tiktok-dm", {
      body,
    });
    if (error) {
      const errMsg =
        (error as { message?: string }).message ?? "tiktok-dm failed";
      throw new Error(errMsg);
    }
    return (data ?? {}) as TikTokDmResponse;
  }
}
