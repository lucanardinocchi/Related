-- Slice 7 — Pass scheduler. The Ambient Intelligence loop dispatches via a
-- queue table (`scheduled_passes`): triggers + the baseline cron job enqueue
-- rows; an Edge Function (later slice) drains them and calls the Pass
-- Engine. This migration lands the queue, the enqueue helpers, the
-- per-source triggers, and the baseline cron job. Per ADR-0001, debounce
-- coalesces rapid bursts inside a 5-minute window so a flurry of edits
-- produces one Pass, not ten.

create extension if not exists pg_cron with schema extensions;

create table public.scheduled_passes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  relationship_id uuid not null,
  mode text not null,
  reason text not null,
  dispatched_at timestamptz,
  created_at timestamptz not null default now(),

  constraint scheduled_passes_mode_valid
    check (mode in ('baseline', 'triggered', 'engaged')),

  foreign key (relationship_id, owner_id)
    references public.relationships (id, owner_id) on delete cascade
);

create index scheduled_passes_owner_id_idx on public.scheduled_passes (owner_id);
create index scheduled_passes_pending_idx
  on public.scheduled_passes (owner_id, relationship_id, mode, created_at desc)
  where dispatched_at is null;

alter table public.scheduled_passes enable row level security;

create policy scheduled_passes_select_own
  on public.scheduled_passes
  for select using (owner_id = auth.uid());

-- enqueue_pass: insert one pending row per (owner, relationship, mode) within
-- the debounce window. The 5-minute window collapses rapid edits — e.g. a
-- User logging three Interactions in quick succession produces one Pass,
-- not three. SECURITY DEFINER so triggers can call it regardless of the
-- caller's role.
create function public.enqueue_pass(
  p_owner_id uuid,
  p_relationship_id uuid,
  p_mode text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.scheduled_passes
    where owner_id = p_owner_id
      and relationship_id = p_relationship_id
      and mode = p_mode
      and dispatched_at is null
      and created_at > now() - interval '5 minutes'
  ) then
    return;
  end if;

  insert into public.scheduled_passes (owner_id, relationship_id, mode, reason)
  values (p_owner_id, p_relationship_id, p_mode, p_reason);
end;
$$;

-- Trigger: AFTER INSERT on interaction_contacts. The join row carries the
-- owner; we look up the affected Relationship via target_contact_id and
-- the Group's Relationship via interactions.group_id (when set).
create function public.interactions_enqueue_pass()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid := new.owner_id;
  v_contact uuid := new.contact_id;
  v_group uuid;
  v_rel record;
begin
  -- Contact-targeted Relationship for this member.
  for v_rel in
    select id from public.relationships
    where owner_id = v_owner
      and target_type = 'contact'
      and target_contact_id = v_contact
  loop
    perform public.enqueue_pass(v_owner, v_rel.id, 'triggered', 'interaction_inserted');
  end loop;

  -- If the parent Interaction is Group-mode, also enqueue against the
  -- Group Relationship. Look it up via the just-inserted interaction.
  select group_id into v_group
  from public.interactions
  where id = new.interaction_id;
  if v_group is not null then
    for v_rel in
      select id from public.relationships
      where owner_id = v_owner
        and target_type = 'group'
        and target_group_id = v_group
    loop
      perform public.enqueue_pass(v_owner, v_rel.id, 'triggered', 'interaction_inserted');
    end loop;
  end if;

  return new;
end;
$$;

create trigger interaction_contacts_after_insert_enqueue_pass
  after insert on public.interaction_contacts
  for each row execute function public.interactions_enqueue_pass();

-- Trigger: AFTER INSERT/UPDATE on open_threads. Enqueue a Pass per linked
-- Relationship. Fires on initial create (reason: open_thread_changed) and on
-- closure.
create function public.open_threads_enqueue_pass()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rel record;
begin
  for v_rel in
    select otr.relationship_id, otr.owner_id
    from public.open_thread_relationships otr
    where otr.open_thread_id = new.id
  loop
    perform public.enqueue_pass(v_rel.owner_id, v_rel.relationship_id, 'triggered', 'open_thread_changed');
  end loop;
  return new;
end;
$$;

create trigger open_threads_after_change_enqueue_pass
  after insert or update on public.open_threads
  for each row execute function public.open_threads_enqueue_pass();

-- Trigger: AFTER UPDATE on candidate_actions when decision_state changes.
-- Enqueue a Pass on the parent set's Relationship.
create function public.candidate_actions_enqueue_pass()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rel uuid;
begin
  if new.decision_state is not distinct from old.decision_state then
    return new;
  end if;
  select cs.relationship_id into v_rel
  from public.candidate_sets cs
  where cs.id = new.candidate_set_id;
  if v_rel is not null then
    perform public.enqueue_pass(new.owner_id, v_rel, 'triggered', 'candidate_decision');
  end if;
  return new;
end;
$$;

create trigger candidate_actions_after_update_enqueue_pass
  after update on public.candidate_actions
  for each row execute function public.candidate_actions_enqueue_pass();

-- schedule_baseline_passes: enqueue a Baseline Pass for every Relationship.
-- Called by pg_cron every 6 hours. Debounce inside enqueue_pass means
-- relationships already in the queue this window are skipped.
create function public.schedule_baseline_passes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rel record;
begin
  for v_rel in
    select id, owner_id from public.relationships
  loop
    perform public.enqueue_pass(v_rel.owner_id, v_rel.id, 'baseline', 'baseline_schedule');
  end loop;
end;
$$;

-- pg_cron: every 6 hours. The local Supabase stack ships pg_cron; in the
-- hosted environment the schedule is the same. We don't pin the slot
-- (cron `0 */6 * * *`) since the agent is global, not per-User.
select cron.schedule(
  'baseline-passes-every-6-hours',
  '0 */6 * * *',
  'select public.schedule_baseline_passes();'
);
