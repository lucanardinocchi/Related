import type { SupabaseClient } from "@supabase/supabase-js";

export interface XMessageSummary {
  id: string;
  text: string;
  fromUsername: string | null;
  sentAt: string;
  direction: "sent" | "received";
}

export interface ListXForContactInput {
  contactId: string;
  xUsername?: string | null;
  xUserId?: string | null;
  maxResults?: number;
}

export interface SendXInput {
  contactId: string;
  xUserId: string;
  text: string;
}

export interface ListXForGroupInput {
  groupId: string;
  xDmConversationId?: string | null;
  memberXUserIds?: string[];
  maxResults?: number;
}

export interface SendXGroupInput {
  groupId: string;
  xDmConversationId: string;
  text: string;
}

export type XContactStatus =
  | "ok"
  | "no_token"
  | "needs_x_scopes"
  | "needs_reconsent"
  | "no_conversation"
  | "error";

interface XDmResponse {
  status?: XContactStatus;
  messages?: XMessageSummary[];
  messageId?: string;
  resolvedUserId?: string | null;
  resolvedConversationId?: string | null;
  error?: string;
}

/**
 * Client for the x-dm Edge Function — lists and sends X DMs for Contacts
 * and Groups using the User's linked X account.
 */
export class XClient {
  constructor(private readonly client: SupabaseClient) {}

  async listForContact(
    input: ListXForContactInput,
  ): Promise<{
    status: XContactStatus;
    messages: XMessageSummary[];
    resolvedUserId: string | null;
  }> {
    const data = await this.invoke({ action: "list", ...input });
    return {
      status: data.status ?? "error",
      messages: data.messages ?? [],
      resolvedUserId: data.resolvedUserId ?? null,
    };
  }

  async send(
    input: SendXInput,
  ): Promise<{ status: XContactStatus; messageId: string | null }> {
    const data = await this.invoke({ action: "send", ...input });
    return {
      status: data.status ?? "error",
      messageId: data.messageId ?? null,
    };
  }

  async listForGroup(
    input: ListXForGroupInput,
  ): Promise<{
    status: XContactStatus;
    messages: XMessageSummary[];
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
    input: SendXGroupInput,
  ): Promise<{ status: XContactStatus; messageId: string | null }> {
    const data = await this.invoke({ action: "sendGroup", ...input });
    return {
      status: data.status ?? "error",
      messageId: data.messageId ?? null,
    };
  }

  async exchangeOAuthCode(input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<{ status: "ok" | "error"; error?: string }> {
    const { data, error } = await this.client.functions.invoke("x-oauth", {
      body: input,
    });
    if (error) {
      const errMsg =
        (error as { message?: string }).message ?? "x-oauth failed";
      throw new Error(errMsg);
    }
    const result = (data ?? {}) as { status?: string; error?: string };
    if (result.status === "ok") return { status: "ok" };
    return { status: "error", error: result.error ?? "OAuth exchange failed" };
  }

  private async invoke(
    body: Record<string, unknown>,
  ): Promise<XDmResponse> {
    const { data, error } = await this.client.functions.invoke("x-dm", {
      body,
    });
    if (error) {
      const errMsg = (error as { message?: string }).message ?? "x-dm failed";
      throw new Error(errMsg);
    }
    return (data ?? {}) as XDmResponse;
  }
}
