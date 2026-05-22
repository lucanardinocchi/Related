import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { OwnerIdResolver } from "../user-context/UserContextClient";

export interface AmbientIntelligencePreferencesRow {
  enabled: boolean;
  updatedAt: string;
}

interface PrefsRow {
  enabled: boolean;
  updated_at: string;
}

function toPrefs(row: PrefsRow): AmbientIntelligencePreferencesRow {
  return {
    enabled: row.enabled,
    updatedAt: row.updated_at,
  };
}

export interface AmbientIntelligencePreferencesClientConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

/**
 * Reads + writes ambient_intelligence_preferences for the signed-in User.
 * When no row exists, Ambient Intelligence is treated as enabled.
 */
export class AmbientIntelligencePreferencesClient {
  constructor(
    private readonly client: SupabaseClient,
    private readonly resolveOwnerId: OwnerIdResolver,
  ) {}

  static fromConfig(
    config: AmbientIntelligencePreferencesClientConfig,
    resolveOwnerId: OwnerIdResolver,
  ): AmbientIntelligencePreferencesClient {
    return new AmbientIntelligencePreferencesClient(
      createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: false },
      }),
      resolveOwnerId,
    );
  }

  async getPreferences(): Promise<AmbientIntelligencePreferencesRow | null> {
    const { data, error } = await this.client
      .from("ambient_intelligence_preferences")
      .select("enabled, updated_at")
      .maybeSingle();
    if (error) throw error;
    return data ? toPrefs(data as PrefsRow) : null;
  }

  /** Returns whether Ambient Intelligence is on (default true when unset). */
  async isEnabled(): Promise<boolean> {
    const prefs = await this.getPreferences();
    return prefs?.enabled ?? true;
  }

  async setEnabled(enabled: boolean): Promise<AmbientIntelligencePreferencesRow> {
    const ownerId = await this.resolveOwnerId();
    const { data, error } = await this.client
      .from("ambient_intelligence_preferences")
      .upsert({ owner_id: ownerId, enabled }, { onConflict: "owner_id" })
      .select("enabled, updated_at")
      .single();
    if (error) throw error;
    return toPrefs(data as PrefsRow);
  }
}
