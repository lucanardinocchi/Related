-- Slice 14 — Transient Intent, the fourth User Context flavour per
-- ADR-0002. Captured ephemerally during a voice session; expires when the
-- session closes (or sooner). Engaged Pass reads non-expired rows scoped
-- to the live session. Baseline and Triggered Passes never see it by
-- design (the snapshot for those modes must not include this table).
create table public.transient_intent (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  session_id text not null,
  relationship_id uuid,
  content text not null,
  captured_at timestamptz not null default now(),
  expires_at timestamptz not null,

  foreign key (relationship_id, owner_id)
    references public.relationships (id, owner_id) on delete cascade
);

create index transient_intent_owner_id_idx on public.transient_intent (owner_id);
create index transient_intent_session_idx
  on public.transient_intent (owner_id, session_id, expires_at);

alter table public.transient_intent enable row level security;

create policy transient_intent_select_own
  on public.transient_intent for select using (owner_id = auth.uid());
create policy transient_intent_insert_own
  on public.transient_intent for insert with check (owner_id = auth.uid());
create policy transient_intent_delete_own
  on public.transient_intent for delete using (owner_id = auth.uid());
