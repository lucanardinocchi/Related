// MCP API key verification for related-mcp.
//
// deno-lint-ignore-file no-explicit-any

import { createClient } from "npm:@supabase/supabase-js@^2.45.0";
import { hashMcpApiKey } from "../../../../shared/src/mcp/mcpApiKey.ts";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
export const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

export const MCP_CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, content-type, accept, mcp-session-id, mcp-protocol-version",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

export function createAdminClient(): any {
  return createClient(SUPABASE_URL ?? "", SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false },
  });
}

export interface VerifiedMcpKey {
  ownerId: string;
  keyId: string;
}

function parseBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const trimmed = authHeader.trim();
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    return trimmed.slice(7).trim();
  }
  if (trimmed.toLowerCase().startsWith("apikey ")) {
    return trimmed.slice(7).trim();
  }
  return trimmed || null;
}

export async function verifyMcpApiKey(
  authHeader: string | null,
  adminClient: any,
): Promise<VerifiedMcpKey | null> {
  const token = parseBearerToken(authHeader);
  if (!token?.startsWith("rk_")) return null;

  const keyHash = await hashMcpApiKey(token);
  const { data, error } = await adminClient
    .from("mcp_api_keys")
    .select("id, owner_id")
    .eq("key_hash", keyHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (error || !data) return null;

  void adminClient
    .from("mcp_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return { ownerId: data.owner_id as string, keyId: data.id as string };
}
