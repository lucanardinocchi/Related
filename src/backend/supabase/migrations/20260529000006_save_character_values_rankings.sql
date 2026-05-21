-- save_character_values_rankings: persist drag-and-drop rank order atomically.
-- Runs as SECURITY INVOKER so RLS applies with the caller's identity; p_owner_id
-- must match auth.uid() so a User cannot rewrite another User's rankings.

create function public.save_character_values_rankings(
  p_owner_id uuid,
  p_character_ids text[]
) returns void
language plpgsql
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'unauthenticated';
  end if;
  if p_owner_id is distinct from v_caller then
    raise exception 'forbidden';
  end if;
  if p_character_ids is null or cardinality(p_character_ids) = 0 then
    return;
  end if;

  update public.user_character_values_alignment as u
  set rank_position = ranked.pos
  from unnest(p_character_ids) with ordinality as ranked(character_id, pos)
  where u.owner_id = p_owner_id
    and u.character_id = ranked.character_id
    and u.aligned = true;

  update public.user_character_values_alignment
  set rank_position = null
  where owner_id = p_owner_id
    and aligned = true
    and not (character_id = any (p_character_ids));
end;
$$;
