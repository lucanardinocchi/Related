import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { OwnerIdResolver } from "../user-context/UserContextClient";

export interface NotificationPreferencesRow {
  enabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  updatedAt: string;
}

interface PrefsRow {
  enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  updated_at: string;
}

function toPrefs(row: PrefsRow): NotificationPreferencesRow {
  return {
    enabled: row.enabled,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    updatedAt: row.updated_at,
  };
}

export interface NotificationsClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/**
 * Reads + writes notification_preferences for the signed-in User.
 * Singleton-per-User on the table is enforced by UNIQUE(owner_id); the
 * client upserts on the same key.
 */
export class NotificationsClient {
  constructor(
    private readonly client: SupabaseClient,
    private readonly resolveOwnerId: OwnerIdResolver,
  ) {}

  static fromConfig(
    config: NotificationsClientConfig,
    resolveOwnerId: OwnerIdResolver,
  ): NotificationsClient {
    return new NotificationsClient(
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false },
      }),
      resolveOwnerId,
    );
  }

  async getPreferences(): Promise<NotificationPreferencesRow | null> {
    const { data, error } = await this.client
      .from("notification_preferences")
      .select("enabled, quiet_hours_start, quiet_hours_end, updated_at")
      .maybeSingle();
    if (error) throw error;
    return data ? toPrefs(data as PrefsRow) : null;
  }

  async setPreferences(input: {
    enabled: boolean;
    quietHoursStart?: string | null;
    quietHoursEnd?: string | null;
  }): Promise<NotificationPreferencesRow> {
    const ownerId = await this.resolveOwnerId();
    const { data, error } = await this.client
      .from("notification_preferences")
      .upsert(
        {
          owner_id: ownerId,
          enabled: input.enabled,
          quiet_hours_start: input.quietHoursStart ?? null,
          quiet_hours_end: input.quietHoursEnd ?? null,
        },
        { onConflict: "owner_id" },
      )
      .select()
      .single();
    if (error) throw error;
    return toPrefs(data as PrefsRow);
  }
}
