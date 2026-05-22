import type { SupabaseClient } from "@supabase/supabase-js";
import type { OwnerIdResolver } from "../user-context/UserContextClient";

export type ProviderName =
  | "google"
  | "instagram"
  | "x"
  | "whatsapp"
  | "tiktok"
  | "outlook"
  | "pocket";

export interface UserProviderToken {
  ownerId: string;
  provider: ProviderName;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string | null;
  providerAccountId: string | null;
  updatedAt: string;
}

export interface UpsertUserProviderTokenInput {
  provider: ProviderName;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  scopes?: string | null;
  providerAccountId?: string | null;
}

interface Row {
  owner_id: string;
  provider: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scopes: string | null;
  provider_account_id: string | null;
  updated_at?: string;
}

function rowToToken(row: Row): UserProviderToken {
  return {
    ownerId: row.owner_id,
    provider: row.provider as ProviderName,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: row.expires_at,
    scopes: row.scopes,
    providerAccountId: row.provider_account_id,
    updatedAt: row.updated_at ?? "",
  };
}

/**
 * Reads + writes per-User OAuth tokens for external integrations (ADR-0006).
 *
 * The provider_token Supabase Auth hands us off the session after OAuth is
 * not persisted by Supabase — we stash it here so the daily sync Edge
 * Function can replay it server-side.
 */
export class UserProviderTokensClient {
  constructor(
    private readonly client: SupabaseClient,
    private readonly resolveOwnerId: OwnerIdResolver,
  ) {}

  async upsert(input: UpsertUserProviderTokenInput): Promise<void> {
    const ownerId = await this.resolveOwnerId();
    const { error } = await this.client
      .from("user_provider_tokens")
      .upsert(
        {
          owner_id: ownerId,
          provider: input.provider,
          access_token: input.accessToken,
          refresh_token: input.refreshToken ?? null,
          expires_at: input.expiresAt ?? null,
          scopes: input.scopes ?? null,
          provider_account_id: input.providerAccountId ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id,provider" },
      )
      .select()
      .single();
    if (error) throw error;
  }

  async getForProvider(provider: ProviderName): Promise<UserProviderToken | null> {
    const { data, error } = await this.client
      .from("user_provider_tokens")
      .select(
        "owner_id, provider, access_token, refresh_token, expires_at, scopes, provider_account_id, updated_at",
      )
      .eq("provider", provider)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return rowToToken(data as Row);
  }

  /** Removes the stored OAuth row for this provider (revokes Related-side access). */
  async deleteForProvider(provider: ProviderName): Promise<void> {
    const ownerId = await this.resolveOwnerId();
    const { error } = await this.client
      .from("user_provider_tokens")
      .delete()
      .eq("owner_id", ownerId)
      .eq("provider", provider);
    if (error) throw error;
  }

  /** Updates scopes only — used when disconnecting Calendar vs Gmail on a shared Google token. */
  async updateScopes(provider: ProviderName, scopes: string): Promise<void> {
    const ownerId = await this.resolveOwnerId();
    const { error } = await this.client
      .from("user_provider_tokens")
      .update({
        scopes,
        updated_at: new Date().toISOString(),
      })
      .eq("owner_id", ownerId)
      .eq("provider", provider);
    if (error) throw error;
  }
}
