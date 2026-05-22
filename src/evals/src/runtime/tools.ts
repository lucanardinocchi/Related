// Fixture-backed tool dispatcher for eval runs.
// Tool definitions live in @related/shared/conversational.

import { CONVERSATIONAL_TOOLS } from "@related/shared/conversational/tools";
import { previewToolResultJson } from "@related/shared/conversational/agentLoop";
import type { FixtureToolData } from "./types";

export { CONVERSATIONAL_TOOLS as TOOLS };
export { previewToolResultJson as previewJson };

function extractOpenThreadRelationshipIds(row: Record<string, unknown>): string[] {
  const links = row.open_thread_relationships as
    | { relationship_id: string }[]
    | undefined;
  return (links ?? []).map((l) => l.relationship_id);
}

function filterOpenThreadsByRelationship(
  rows: Record<string, unknown>[],
  relationshipId: string,
): Record<string, unknown>[] {
  return rows.filter((r) =>
    extractOpenThreadRelationshipIds(r).includes(relationshipId),
  );
}

function filterInteractionsByContact(
  rows: Record<string, unknown>[],
  contactId: string,
): Record<string, unknown>[] {
  return rows.filter((r) => {
    const links = r.interaction_contacts as { contact_id: string }[] | undefined;
    return (links ?? []).some((l) => l.contact_id === contactId);
  });
}

export function dispatchFixtureTool(
  name: string,
  input: Record<string, unknown>,
  fixture: FixtureToolData,
): unknown {
  switch (name) {
    case "list_relationships": {
      const targetType = input.target_type as string | undefined;
      let rows = [...fixture.relationships];
      if (targetType && targetType !== "all") {
        rows = rows.filter((r) => r.target_type === targetType);
      }
      return rows;
    }
    case "get_relationship": {
      const id = input.relationship_id as string;
      const row = fixture.relationships.find((r) => r.id === id);
      if (!row) throw new Error(`relationship not found: ${id}`);
      return row;
    }
    case "list_contacts":
      return [...fixture.contacts];
    case "get_contact": {
      const id = input.contact_id as string;
      const row = fixture.contacts.find((c) => c.id === id);
      if (!row) throw new Error(`contact not found: ${id}`);
      return row;
    }
    case "list_open_threads": {
      const relationshipId = input.relationship_id as string | undefined;
      const direction = input.direction as string | undefined;
      const includeClosed = !!input.include_closed;
      let rows = [...fixture.openThreads];
      if (!includeClosed) {
        rows = rows.filter((r) => r.closed_at == null);
      }
      if (direction) {
        rows = rows.filter((r) => r.direction === direction);
      }
      if (relationshipId) {
        rows = filterOpenThreadsByRelationship(rows, relationshipId);
      }
      return rows;
    }
    case "list_interactions": {
      const status = input.status as string | undefined;
      const since = input.since as string | undefined;
      const until = input.until as string | undefined;
      const contactId = input.contact_id as string | undefined;
      let rows = [...fixture.interactions];
      if (status) rows = rows.filter((r) => r.status === status);
      if (since) {
        rows = rows.filter(
          (r) => typeof r.time === "string" && r.time >= since,
        );
      }
      if (until) {
        rows = rows.filter(
          (r) => typeof r.time === "string" && r.time <= until,
        );
      }
      if (contactId) {
        rows = filterInteractionsByContact(rows, contactId);
      }
      return rows;
    }
    case "list_calendar_events": {
      const since = input.since as string | undefined;
      const until = input.until as string | undefined;
      let rows = [...fixture.events];
      if (since) {
        rows = rows.filter(
          (r) => typeof r.start === "string" && r.start >= since,
        );
      }
      if (until) {
        rows = rows.filter(
          (r) => typeof r.start === "string" && r.start <= until,
        );
      }
      return rows.slice(0, 200);
    }
    case "list_groups":
      return fixture.groups.map((g) => ({
        id: g.id,
        name: g.name,
        created_at: g.created_at ?? null,
      }));
    case "get_group": {
      const id = input.group_id as string;
      const row = fixture.groups.find((g) => g.id === id);
      if (!row) throw new Error(`group not found: ${id}`);
      return row;
    }
    case "get_user_context":
      return {
        goals_and_values: fixture.userContext.goalsAndValues,
        situational_state: fixture.userContext.situationalState,
        transient_intent: fixture.userContext.transientIntent,
        inferred_signals: fixture.userContext.inferredSignals,
      };
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
