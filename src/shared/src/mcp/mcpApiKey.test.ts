import {
  generateMcpApiKey,
  hashMcpApiKey,
  mcpApiKeyPrefix,
  mcpServerUrlFromSupabaseUrl,
} from "./mcpApiKey";

describe("mcpApiKey helpers", () => {
  it("generates keys with rk_ prefix", () => {
    const key = generateMcpApiKey();
    expect(key).toMatch(/^rk_[0-9a-f]{48}$/);
  });

  it("hashes keys deterministically", async () => {
    const hash = await hashMcpApiKey("rk_test");
    expect(hash).toHaveLength(64);
    expect(await hashMcpApiKey("rk_test")).toBe(hash);
  });

  it("builds a display prefix", () => {
    expect(mcpApiKeyPrefix("rk_abcdef123456")).toBe("rk_abcdef12…");
  });

  it("derives the MCP server URL from Supabase URL", () => {
    expect(
      mcpServerUrlFromSupabaseUrl("https://abc.supabase.co/"),
    ).toBe("https://abc.supabase.co/functions/v1/related-mcp");
  });
});
