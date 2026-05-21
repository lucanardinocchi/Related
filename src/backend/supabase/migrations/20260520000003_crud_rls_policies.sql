-- ADR-0008: web becomes the primary CRUD surface. Several core tables were
-- created with only SELECT + INSERT policies (mobile was append-only for
-- contacts/relationships/groups; edits happened indirectly via
-- agent-executed RPCs). The web Relationship/Group detail pages let the
-- User edit and delete these entities directly, so we need UPDATE and
-- DELETE policies gated on owner_id.
--
-- Relationships' role and cadence columns were added in slice 8
-- (20260519000009_relationships_role_cadence.sql) but no UPDATE policy
-- shipped alongside — so they have been unreachable from authenticated
-- clients until now. This migration fixes that gap as well.
--
-- DELETE on relationships will cascade through ON DELETE CASCADE on
-- open_thread_relationships, interaction_contacts (the join tables FK back
-- to (id, owner_id) on both contacts and relationships); contacts deletes
-- cascade similarly. There is no ON DELETE for candidate_sets/actions
-- against relationships in the existing schema — those persist beyond a
-- relationship delete and become orphaned by relationship_id. That is
-- acceptable for now (the Candidate Sets are append-only history and the
-- relationship_id is FK'd with no cascade in the original migration).

-- contacts: allow owner edits and deletes.
create policy contacts_update_own
  on public.contacts
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy contacts_delete_own
  on public.contacts
  for delete
  using (owner_id = auth.uid());

-- relationships: allow owner edits (role, cadence) and deletes.
create policy relationships_update_own
  on public.relationships
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy relationships_delete_own
  on public.relationships
  for delete
  using (owner_id = auth.uid());

-- groups: allow owner rename and delete.
create policy groups_update_own
  on public.groups
  for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy groups_delete_own
  on public.groups
  for delete
  using (owner_id = auth.uid());
