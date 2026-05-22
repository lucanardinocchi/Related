import type { SupabaseClient } from "@supabase/supabase-js";
import {
  generateMcpApiKey,
  hashMcpApiKey,
  mcpApiKeyPrefix,
} from "./mcpApiKey";

export interface McpApiKeyRecord {
  id: string;
  keyPrefix: string;
  label: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreateMcpApiKeyResult {
  id: string;
  apiKey: string;
  keyPrefix: string;
  createdAt: string;
}

interface McpApiKeyRow {
  id: string;
  key_prefix: string;
  label: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

const MCP_API_KEY_COLUMNS =
  "id, key_prefix, label, last_used_at, revoked_at, created_at";

function toMcpApiKeyRecord(row: McpApiKeyRow): McpApiKeyRecord {
  return {
    id: row.id,
    keyPrefix: row.key_prefix,
    label: row.label,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

/**
 * MCP API keys for connecting external AI tools to Related. Plaintext keys
 * are shown once at creation; only a hash is persisted.
 */
export class McpClient {
  constructor(private readonly client: SupabaseClient) {}

  async createApiKey(label = "Default"): Promise<CreateMcpApiKeyResult> {
    const {
      data: { user },
      error: authError,
    } = await this.client.auth.getUser();
    if (authError || !user) {
      throw new Error(authError?.message ?? "Not signed in");
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const apiKey = generateMcpApiKey();
      const keyHash = await hashMcpApiKey(apiKey);
      const keyPrefix = mcpApiKeyPrefix(apiKey);

      const { data, error } = await this.client
        .from("mcp_api_keys")
        .insert({
          owner_id: user.id,
          key_hash: keyHash,
          key_prefix: keyPrefix,
          label: label.trim() || "Default",
        })
        .select("id, created_at")
        .single();

      if (!error && data) {
        return {
          id: data.id as string,
          apiKey,
          keyPrefix,
          createdAt: data.created_at as string,
        };
      }
      if (error?.code !== "23505") {
        throw error;
      }
    }

    throw new Error("failed to generate unique MCP API key");
  }

  async listApiKeys(): Promise<McpApiKeyRecord[]> {
    const { data, error } = await this.client
      .from("mcp_api_keys")
      .select(MCP_API_KEY_COLUMNS)
      .is("revoked_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as McpApiKeyRow[]).map(toMcpApiKeyRecord);
  }

  async revokeApiKey(id: string): Promise<void> {
    const { error } = await this.client
      .from("mcp_api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  }
}
