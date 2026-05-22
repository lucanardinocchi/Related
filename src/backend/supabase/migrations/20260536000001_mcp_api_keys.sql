-- MCP API keys: long-lived credentials for external AI tools (Cursor,
-- Claude Desktop, etc.) to connect to the Related MCP server.

create table public.mcp_api_keys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  key_hash text not null,
  key_prefix text not null,
  label text not null default 'Default',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),

  constraint mcp_api_keys_key_hash_unique unique (key_hash)
);

create index mcp_api_keys_owner_idx on public.mcp_api_keys (owner_id);

alter table public.mcp_api_keys enable row level security;

create policy mcp_api_keys_select_own
  on public.mcp_api_keys for select using (owner_id = auth.uid());

create policy mcp_api_keys_insert_own
  on public.mcp_api_keys for insert with check (owner_id = auth.uid());

create policy mcp_api_keys_update_own
  on public.mcp_api_keys for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
