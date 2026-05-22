import type { SupabaseClient } from "@supabase/supabase-js";
import { parseEdgeFunctionError } from "./parseEdgeFunctionError";

export interface OutlookMessageSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  direction: "sent" | "received";
}

export interface OutlookMessageDetail {
  id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
}

export interface ListOutlookForContactInput {
  contactEmail: string;
  maxResults?: number;
}

export interface SendOutlookInput {
  to: string;
  subject: string;
  body: string;
}

export type OutlookContactStatus =
  | "ok"
  | "no_token"
  | "needs_outlook_mail_scopes"
  | "needs_reconsent"
  | "error";

interface OutlookContactResponse {
  status?: OutlookContactStatus;
  messages?: OutlookMessageSummary[];
  message?: OutlookMessageDetail;
  messageId?: string;
  error?: string;
}

/**
 * Client for Outlook integration — OAuth exchange via outlook-oauth and
 * mail list/send via outlook-contact Edge Functions.
 */
export class OutlookClient {
  constructor(private readonly client: SupabaseClient) {}

  async exchangeOAuthCode(input: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<{ status: "ok" | "error"; error?: string }> {
    const { data, error } = await this.client.functions.invoke("outlook-oauth", {
      body: input,
    });
    if (error) {
      throw new Error(
        await parseEdgeFunctionError(error, "outlook-oauth failed"),
      );
    }
    const result = (data ?? {}) as { status?: string; error?: string };
    if (result.status === "ok") return { status: "ok" };
    return { status: "error", error: result.error ?? "OAuth exchange failed" };
  }

  async listForContact(
    input: ListOutlookForContactInput,
  ): Promise<{ status: OutlookContactStatus; messages: OutlookMessageSummary[] }> {
    const data = await this.invokeMail({ action: "list", ...input });
    return {
      status: data.status ?? "error",
      messages: data.messages ?? [],
    };
  }

  async send(
    input: SendOutlookInput,
  ): Promise<{ status: OutlookContactStatus; messageId: string | null }> {
    const data = await this.invokeMail({ action: "send", ...input });
    return {
      status: data.status ?? "error",
      messageId: data.messageId ?? null,
    };
  }

  async getMessage(
    messageId: string,
  ): Promise<{ status: OutlookContactStatus; message: OutlookMessageDetail | null }> {
    const data = await this.invokeMail({ action: "get", messageId });
    return {
      status: data.status ?? "error",
      message: data.message ?? null,
    };
  }

  private async invokeMail(
    body: Record<string, unknown>,
  ): Promise<OutlookContactResponse> {
    const { data, error } = await this.client.functions.invoke("outlook-contact", {
      body,
    });
    if (error) {
      const errMsg =
        (error as { message?: string }).message ?? "outlook-contact failed";
      throw new Error(errMsg);
    }
    return (data ?? {}) as OutlookContactResponse;
  }
}
