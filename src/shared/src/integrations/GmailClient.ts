import type { SupabaseClient } from "@supabase/supabase-js";

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  direction: "sent" | "received";
}

export interface ListGmailForContactInput {
  contactEmail: string;
  maxResults?: number;
}

export interface SendGmailInput {
  to: string;
  subject: string;
  body: string;
}

export type GmailContactStatus =
  | "ok"
  | "no_token"
  | "needs_gmail_scopes"
  | "needs_reconsent"
  | "error";

interface GmailContactResponse {
  status?: GmailContactStatus;
  messages?: GmailMessageSummary[];
  messageId?: string;
  error?: string;
}

/**
 * Client for the gmail-contact Edge Function — lists and sends Gmail
 * messages for a Contact email address using the User's linked Google account.
 */
export class GmailClient {
  constructor(private readonly client: SupabaseClient) {}

  async listForContact(
    input: ListGmailForContactInput,
  ): Promise<{ status: GmailContactStatus; messages: GmailMessageSummary[] }> {
    const data = await this.invoke({ action: "list", ...input });
    return {
      status: data.status ?? "error",
      messages: data.messages ?? [],
    };
  }

  async send(input: SendGmailInput): Promise<{ status: GmailContactStatus; messageId: string | null }> {
    const data = await this.invoke({ action: "send", ...input });
    return {
      status: data.status ?? "error",
      messageId: data.messageId ?? null,
    };
  }

  private async invoke(body: Record<string, unknown>): Promise<GmailContactResponse> {
    const { data, error } = await this.client.functions.invoke("gmail-contact", {
      body,
    });
    if (error) {
      const errMsg =
        (error as { message?: string }).message ?? "gmail-contact failed";
      throw new Error(errMsg);
    }
    return (data ?? {}) as GmailContactResponse;
  }
}
