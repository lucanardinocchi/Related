import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Client for Outlook Calendar OAuth — exchanges the authorization code via
 * the outlook-oauth Edge Function and persists tokens server-side.
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
      const errMsg =
        (error as { message?: string }).message ?? "outlook-oauth failed";
      throw new Error(errMsg);
    }
    const result = (data ?? {}) as { status?: string; error?: string };
    if (result.status === "ok") return { status: "ok" };
    return { status: "error", error: result.error ?? "OAuth exchange failed" };
  }
}
