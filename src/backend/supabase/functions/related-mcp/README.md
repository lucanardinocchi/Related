# related-mcp

Related MCP server for Cursor, Claude Desktop, Claude Code, and other MCP clients.

## Auth

`Authorization: Bearer rk_…` using an API key from **Settings → Connect MCP** in the web app.

Gateway JWT verification is disabled; the handler validates `mcp_api_keys` directly.

## Transport

Streamable HTTP (JSON-RPC 2.0 over POST):

- `initialize`
- `tools/list`
- `tools/call`
- `ping`

URL: `https://<project-ref>.supabase.co/functions/v1/related-mcp`

## Tools

**Read** (same surface as Conversational Intelligence):

- `list_relationships`, `get_relationship`
- `list_contacts`, `get_contact`
- `list_groups`, `get_group`
- `list_open_threads`, `list_interactions`, `list_calendar_events`
- `get_user_context`

**Write**:

- `create_interaction`, `update_interaction`, `delete_interaction`
- `create_event`, `update_event`, `delete_event` (manual events only)
- `create_commitment`, `update_commitment`, `close_commitment`

## Deploy

```bash
cd src/backend
supabase functions deploy related-mcp --no-verify-jwt
```

## Smoke test

Replace `rk_…` with a key from Settings → Connect MCP:

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/related-mcp" \
  -H "Authorization: Bearer rk_…" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```
