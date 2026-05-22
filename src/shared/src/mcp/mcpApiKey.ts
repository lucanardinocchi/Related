const MCP_KEY_PREFIX = "rk_";
const MCP_KEY_RANDOM_BYTES = 24;

export async function hashMcpApiKey(key: string): Promise<string> {
  const data = new TextEncoder().encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateMcpApiKey(): string {
  const bytes = new Uint8Array(MCP_KEY_RANDOM_BYTES);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${MCP_KEY_PREFIX}${hex}`;
}

export function mcpApiKeyPrefix(key: string): string {
  const visible = key.slice(0, MCP_KEY_PREFIX.length + 8);
  return `${visible}…`;
}

export function mcpServerUrlFromSupabaseUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/related-mcp`;
}
