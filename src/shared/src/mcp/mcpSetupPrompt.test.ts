import { buildMcpSetupPrompt } from "./mcpSetupPrompt";

describe("buildMcpSetupPrompt", () => {
  it("includes MCP credentials and client setup steps", () => {
    const prompt = buildMcpSetupPrompt({
      apiKey: "rk_abc123def456",
      mcpServerUrl: "https://abc.supabase.co/functions/v1/related-mcp/",
    });

    expect(prompt).toContain(
      "MCP server URL: https://abc.supabase.co/functions/v1/related-mcp",
    );
    expect(prompt).toContain("API key: rk_abc123def456");
    expect(prompt).toContain("mcp-remote");
    expect(prompt).toContain("Bearer rk_abc123def456");
    expect(prompt).toContain("~/.cursor/mcp.json");
    expect(prompt).toContain("claude mcp add related");
    expect(prompt).toContain("create/update/delete interactions");
  });
});
