import type { SupabaseClient } from "@supabase/supabase-js";

export interface WhatsAppMessageSummary {
  id: string;
  text: string;
  fromPhone: string | null;
  fromName: string | null;
  sentAt: string;
  direction: "sent" | "received";
}

export interface ListWhatsAppForContactInput {
  contactId: string;
  phone?: string | null;
  whatsappWaId?: string | null;
  maxResults?: number;
}

export interface SendWhatsAppInput {
  contactId: string;
  whatsappWaId: string;
  text: string;
}

export interface ListWhatsAppForGroupInput {
  groupId: string;
  whatsappGroupId?: string | null;
  memberPhones?: string[];
  maxResults?: number;
}

export interface SendWhatsAppGroupInput {
  groupId: string;
  whatsappGroupId: string;
  text: string;
}

export type WhatsAppContactStatus =
  | "ok"
  | "no_token"
  | "needs_whatsapp_scopes"
  | "needs_reconsent"
  | "no_conversation"
  | "error";

interface WhatsAppDmResponse {
  status?: WhatsAppContactStatus;
  messages?: WhatsAppMessageSummary[];
  messageId?: string;
  resolvedWaId?: string | null;
  resolvedGroupId?: string | null;
  error?: string;
}

/**
 * Client for the whatsapp-dm Edge Function — lists and sends WhatsApp DMs
 * for Contacts and Groups using the User's linked WhatsApp Business account.
 */
export class WhatsAppClient {
  constructor(private readonly client: SupabaseClient) {}

  async listForContact(
    input: ListWhatsAppForContactInput,
  ): Promise<{
    status: WhatsAppContactStatus;
    messages: WhatsAppMessageSummary[];
    resolvedWaId: string | null;
  }> {
    const data = await this.invoke({ action: "list", ...input });
    return {
      status: data.status ?? "error",
      messages: data.messages ?? [],
      resolvedWaId: data.resolvedWaId ?? null,
    };
  }

  async send(
    input: SendWhatsAppInput,
  ): Promise<{ status: WhatsAppContactStatus; messageId: string | null }> {
    const data = await this.invoke({ action: "send", ...input });
    return {
      status: data.status ?? "error",
      messageId: data.messageId ?? null,
    };
  }

  async listForGroup(
    input: ListWhatsAppForGroupInput,
  ): Promise<{
    status: WhatsAppContactStatus;
    messages: WhatsAppMessageSummary[];
    resolvedGroupId: string | null;
  }> {
    const data = await this.invoke({ action: "listGroup", ...input });
    return {
      status: data.status ?? "error",
      messages: data.messages ?? [],
      resolvedGroupId: data.resolvedGroupId ?? null,
    };
  }

  async sendGroup(
    input: SendWhatsAppGroupInput,
  ): Promise<{ status: WhatsAppContactStatus; messageId: string | null }> {
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
    const { data, error } = await this.client.functions.invoke("whatsapp-oauth", {
      body: input,
    });
    if (error) {
      const errMsg =
        (error as { message?: string }).message ?? "whatsapp-oauth failed";
      throw new Error(errMsg);
    }
    const result = (data ?? {}) as { status?: string; error?: string };
    if (result.status === "ok") return { status: "ok" };
    return { status: "error", error: result.error ?? "OAuth exchange failed" };
  }

  private async invoke(
    body: Record<string, unknown>,
  ): Promise<WhatsAppDmResponse> {
    const { data, error } = await this.client.functions.invoke("whatsapp-dm", {
      body,
    });
    if (error) {
      const errMsg =
        (error as { message?: string }).message ?? "whatsapp-dm failed";
      throw new Error(errMsg);
    }
    return (data ?? {}) as WhatsAppDmResponse;
  }
}
