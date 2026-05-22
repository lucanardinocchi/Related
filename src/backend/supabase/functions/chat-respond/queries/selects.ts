// Supabase select strings — single source of truth for join shapes.

export const RELATIONSHIP_SELECT_SNAPSHOT =
  "id, target_type, role, cadence, contact:contacts!target_contact_id(name), group_target:groups!target_group_id(name)";

export const RELATIONSHIP_SELECT_TOOL =
  "id, target_type, role, cadence, created_at, contact:contacts!target_contact_id(id, name, phone, email, birthday, area, occupation, education), group_target:groups!target_group_id(id, name)";

export const GROUP_SELECT_SNAPSHOT = "id, name, contact_groups(contact_id)";
export const GROUP_SELECT_LIST = "id, name, created_at";
export const GROUP_SELECT_DETAIL =
  "id, name, created_at, contact_groups(contact_id, contacts(id, name))";

export const OPEN_THREAD_SELECT_SNAPSHOT =
  "id, description, direction, created_at, open_thread_relationships(relationship_id)";
export const OPEN_THREAD_SELECT_TOOL =
  "id, description, direction, origin, communication_status, created_at, closed_at, open_thread_relationships(relationship_id)";

export const INTERACTION_SELECT_SNAPSHOT =
  "id, time, kind, status, interaction_contacts(contact_id)";
export const INTERACTION_SELECT_TOOL =
  "id, time, kind, notes, status, interaction_contacts(contact_id, contacts(name))";

export const GOALS_SELECT_SNAPSHOT = "content";
export const GOALS_SELECT_TOOL = "id, content, created_at, updated_at";
export const SITUATIONAL_SELECT_SNAPSHOT = "content";
export const SITUATIONAL_SELECT_TOOL = "id, content, updated_at";
export const TRANSIENT_SELECT_SNAPSHOT =
  "content, captured_at, relationship_id";
export const TRANSIENT_SELECT_TOOL =
  "id, content, captured_at, expires_at, relationship_id";
