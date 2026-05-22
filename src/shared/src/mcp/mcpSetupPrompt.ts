export interface McpSetupPromptInput {
  apiKey: string;
  mcpServerUrl: string;
}

/**
 * Self-contained prompt for Claude Code, Cursor, or similar tools to wire
 * Related MCP into the user's AI environment.
 */
export function buildMcpSetupPrompt(input: McpSetupPromptInput): string {
  const mcpServerUrl = input.mcpServerUrl.replace(/\/+$/, "");

  return `Connect the Related MCP server to this AI tool so I can query my relationships, contacts, calendar, open threads, and user context from Related.

Related MCP credentials (use exactly):
- MCP server URL: ${mcpServerUrl}
- API key: ${input.apiKey}

Do this end-to-end:

1. Detect which AI client is running (Cursor, Claude Desktop, Claude Code CLI, Windsurf, Cline, or another MCP-compatible tool).

2. Add Related as a remote MCP server using \`mcp-remote\` and an Authorization header. Some clients mangle JSON args that contain spaces — use an \`AUTH_HEADER\` env var when needed:

   {
     "related": {
       "command": "npx",
       "args": [
         "-y",
         "mcp-remote",
         "${mcpServerUrl}",
         "--header",
         "Authorization:\${AUTH_HEADER}"
       ],
       "env": {
         "AUTH_HEADER": "Bearer ${input.apiKey}"
       }
     }
   }

   File locations by client:
   - Cursor: Settings → Features → MCP Servers, or \`~/.cursor/mcp.json\`
   - Claude Desktop: \`~/Library/Application Support/Claude/claude_desktop_config.json\` (macOS) or \`%APPDATA%\\Claude\\claude_desktop_config.json\` (Windows) under \`mcpServers\`
   - Claude Code CLI: \`claude mcp add related --transport http ${mcpServerUrl} --header "Authorization: Bearer ${input.apiKey}"\`
   - Windsurf: \`~/.windsurf/mcp.json\`

3. Merge with any existing \`mcpServers\` config — do not overwrite unrelated servers.

4. Restart the client after saving config.

5. Verify Related MCP is connected:
   - Look for a plug/MCP icon or a tools list that includes Related tools (e.g. list relationships, search contacts, read calendar).
   - If auth fails, confirm the API key starts with \`rk_\` and that the Authorization header is forwarded by \`mcp-remote\`.

If anything fails, diagnose JSON syntax, header forwarding, and API key validity. Tell me when Related MCP shows as connected.`;
}
