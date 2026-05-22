import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface PlatformCommsTouchpoint {
  contactId: string;
  sentAt: string;
}

export interface CommsPlatformMessagesClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

interface Row {
  contact_id: string;
  sent_at: string;
}

/**
 * Cached email / Instagram / X messages per Contact. Used by the relationship
 * Comms section and inner-circle closeness scoring.
 */
export class CommsPlatformMessagesClient {
  constructor(private readonly client: SupabaseClient) {}

  static fromConfig(
    config: CommsPlatformMessagesClientConfig,
  ): CommsPlatformMessagesClient {
    return new CommsPlatformMessagesClient(
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false },
      }),
    );
  }

  async listForUser(): Promise<PlatformCommsTouchpoint[]> {
    const { data, error } = await this.client
      .from("comms_platform_messages")
      .select("contact_id, sent_at")
      .order("sent_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as Row[]).map((row) => ({
      contactId: row.contact_id,
      sentAt: row.sent_at,
    }));
  }
}
