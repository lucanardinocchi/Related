-- Missing Triggered Pass triggers per ADR-0001: Goals & Values edits,
-- Inferred Signal shifts, and approaching planned Interactions.

-- Shared helper: enqueue one pending Pass per Relationship owned by a User.
-- Used when global User Context shifts (Goals & Values, Inferred Signals).
create function public.enqueue_passes_for_owner_relationships(
  p_owner_id uuid,
  p_mode text,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rel record;
begin
  for v_rel in
    select id from public.relationships
    where owner_id = p_owner_id
  loop
    perform public.enqueue_pass(p_owner_id, v_rel.id, p_mode, p_reason);
  end loop;
end;
$$;

-- Trigger: AFTER INSERT/UPDATE/DELETE on goals_and_values. A Goal or Value
-- edit is global User Context — enqueue a Pass for every owned Relationship.
create function public.goals_and_values_enqueue_pass()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  v_owner := coalesce(new.owner_id, old.owner_id);
  perform public.enqueue_passes_for_owner_relationships(
    v_owner, 'triggered', 'goals_and_values_changed'
  );
  return coalesce(new, old);
end;
$$;

create trigger goals_and_values_after_change_enqueue_pass
  after insert or update or delete on public.goals_and_values
  for each row execute function public.goals_and_values_enqueue_pass();

-- Trigger: AFTER INSERT/UPDATE/DELETE on inferred_signal_calendar. Calendar
-- density shifts are global User Context — enqueue for all Relationships.
create function public.inferred_signal_calendar_enqueue_pass()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  v_owner := coalesce(new.owner_id, old.owner_id);
  perform public.enqueue_passes_for_owner_relationships(
    v_owner, 'triggered', 'inferred_signal_calendar_changed'
  );
  return coalesce(new, old);
end;
$$;

create trigger inferred_signal_calendar_after_change_enqueue_pass
  after insert or update or delete on public.inferred_signal_calendar
  for each row execute function public.inferred_signal_calendar_enqueue_pass();

-- Trigger: AFTER INSERT/UPDATE/DELETE on inferred_signal_sleep. Sleep signal
-- shifts are global User Context — enqueue for all Relationships.
create function public.inferred_signal_sleep_enqueue_pass()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  v_owner := coalesce(new.owner_id, old.owner_id);
  perform public.enqueue_passes_for_owner_relationships(
    v_owner, 'triggered', 'inferred_signal_sleep_changed'
  );
  return coalesce(new, old);
end;
$$;

create trigger inferred_signal_sleep_after_change_enqueue_pass
  after insert or update or delete on public.inferred_signal_sleep
  for each row execute function public.inferred_signal_sleep_enqueue_pass();

-- Helper: enqueue passes for Relationships linked to an Interaction (contact
-- targets plus optional Group Relationship). Mirrors interactions_enqueue_pass.
create function public.enqueue_passes_for_interaction(
  p_owner_id uuid,
  p_interaction_id uuid,
  p_reason text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact uuid;
  v_group uuid;
  v_rel record;
begin
  for v_contact in
    select contact_id from public.interaction_contacts
    where interaction_id = p_interaction_id
      and owner_id = p_owner_id
  loop
    for v_rel in
      select id from public.relationships
      where owner_id = p_owner_id
        and target_type = 'contact'
        and target_contact_id = v_contact
    loop
      perform public.enqueue_pass(p_owner_id, v_rel.id, 'triggered', p_reason);
    end loop;
  end loop;

  select group_id into v_group
  from public.interactions
  where id = p_interaction_id;

  if v_group is not null then
    for v_rel in
      select id from public.relationships
      where owner_id = p_owner_id
        and target_type = 'group'
        and target_group_id = v_group
    loop
      perform public.enqueue_pass(p_owner_id, v_rel.id, 'triggered', p_reason);
    end loop;
  end if;
end;
$$;

-- schedule_approaching_planned_interaction_passes: enqueue a Triggered Pass
-- for each Relationship linked to a planned Interaction in the next 48 hours.
-- Called by pg_cron; debounce inside enqueue_pass coalesces repeat scans.
create function public.schedule_approaching_planned_interaction_passes()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_interaction record;
begin
  for v_interaction in
    select id, owner_id
    from public.interactions
    where status = 'planned'
      and time > now()
      and time <= now() + interval '48 hours'
  loop
    perform public.enqueue_passes_for_interaction(
      v_interaction.owner_id,
      v_interaction.id,
      'planned_interaction_approaching'
    );
  end loop;
end;
$$;

-- pg_cron: every 6 hours. Scans planned Interactions in the approaching window
-- and enqueues Triggered Passes on linked Relationships.
select cron.schedule(
  'approaching-planned-interactions-every-6-hours',
  '0 */6 * * *',
  'select public.schedule_approaching_planned_interaction_passes();'
);
