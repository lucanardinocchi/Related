import type { SupabaseClient } from "@supabase/supabase-js";

export interface InstagramMessageSummary {
  id: string;
  text: string;
  fromUsername: string | null;
  toUsername: string | null;
  sentAt: string;
  direction: "sent" | "received";
}

export interface ListInstagramForContactInput {
  contactId: string;
  instagramUsername?: string | null;
  instagramScopedId?: string | null;
  maxResults?: number;
}

export interface SendInstagramInput {
  contactId: string;
  instagramScopedId: string;
  text: string;
}

export type InstagramContactStatus =
  | "ok"
  | "no_token"
  | "needs_instagram_scopes"
  | "needs_reconsent"
  | "no_conversation"
  | "error";

interface InstagramContactResponse {
  status?: InstagramContactStatus;
  messages?: InstagramMessageSummary[];
  messageId?: string;
  resolvedScopedId?: string | null;
  error?: string;
}

/**
 * Client for the instagram-dm Edge Function — lists and sends Instagram
 * DMs for a Contact using the User's linked Instagram professional account.
 */
export class InstagramClient {
  constructor(private readonly client: SupabaseClient) {}

  async listForContact(
    input: ListInstagramForContactInput,
  ): Promise<{
    status: InstagramContactStatus;
    messages: InstagramMessageSummary[];
    resolvedScopedId: string | null;
  }> {
    const data = await this.invoke({ action: "list", ...input });
    return {
      status: data.status ?? "error",
      messages: data.messages ?? [],
      resolvedScopedId: data.resolvedScopedId ?? null,
    };
  }

  async send(
    input: SendInstagramInput,
  ): Promise<{ status: InstagramContactStatus; messageId: string | null }> {
    const data = await this.invoke({ action: "send", ...input });
    return {
      status: data.status ?? "error",
      messageId: data.messageId ?? null,
    };
  }

  async exchangeOAuthCode(input: {
    code: string;
    redirectUri: string;
  }): Promise<{ status: "ok" | "error"; error?: string }> {
    const { data, error } = await this.client.functions.invoke(
      "instagram-oauth",
      { body: input },
    );
    if (error) {
      const errMsg =
        (error as { message?: string }).message ?? "instagram-oauth failed";
      throw new Error(errMsg);
    }
    const result = (data ?? {}) as { status?: string; error?: string };
    if (result.status === "ok") return { status: "ok" };
    return { status: "error", error: result.error ?? "OAuth exchange failed" };
  }

  private async invoke(
    body: Record<string, unknown>,
  ): Promise<InstagramContactResponse> {
    const { data, error } = await this.client.functions.invoke("instagram-dm", {
      body,
    });
    if (error) {
      const errMsg =
        (error as { message?: string }).message ?? "instagram-dm failed";
      throw new Error(errMsg);
    }
    return (data ?? {}) as InstagramContactResponse;
  }
}
