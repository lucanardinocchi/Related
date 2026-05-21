# extract-context

Extraction Pass per [ADR-0009](../../../../../docs/adr/0009-three-agent-architecture.md) (amended 2026-05-21 to add Relationship Context as a write surface).

Runs over the transcript of a **closed** Chat. Sorts the User's narrative content **by Relationship** and writes:

- `situational_state` — User-wide self-narrative (singleton per User; replace whole content).
- `transient_intent` — User-wide ephemeral intents (append; 7-day decay from chat `closed_at`; optional `relationship_id` when an intent targets a specific person/group).
- `relationship_context` — per-Relationship narrative singleton (one row per Relationship; replace whole content). For Group-targeted Relationships, holistic group content lands here. Member-specific fragments within that group content fan out additionally to each member Contact's Relationship Context.

**Will not** write to:

- `goals_and_values` — User-authored only.
- `interactions`, `open_threads`, `relationships.role`, `relationships.cadence` — operational entities, still gated by the Candidate Action invariant. The next Ambient Pass will surface candidates informed by the richer narrative this function just wrote.

## Read tools (mirror chat-respond)

The model has read access to enumerate the User's world before writing:

- `list_relationships`, `get_relationship`
- `list_contacts`, `get_contact`
- `list_groups`, `get_group` (includes member Contacts — essential for fan-out)
- `get_relationship_context` — read prior content so the replacement preserves what's still true.

## Sort passes (prompt-driven)

1. **Group sort.** Holistic group content → Group Relationship Context.
2. **Member fan-out.** Member-specific fragments inside group content → that member Contact's Relationship Context (additionally to the Group's).
3. **Direct individual mentions.** Per-Contact content outside any group framing → that Contact's Relationship Context.
4. **User self-narrative.** User's own life → Situational State; ephemeral User intents → Transient Intent (with `relationship_id` when targeted).

## Naming ambiguity

Conversational Intelligence (`chat-respond`) is expected to disambiguate names live during the Chat (it has the same read tools and a prompt rule to do so). If ambiguity remains in the transcript, this function over-attributes — writes the relevant fragment to **all** plausible matches with an inline `[possibly also refers to: Other Name]` marker. Never drops a fragment silently.

## Idempotency

Reads `chats.extracted_at`. If set, returns `{ skipped: true, reason: "already extracted" }` without invoking the model. On success, stamps `extracted_at = now()`. Empty transcripts are stamped to avoid wasted future invocations.

## Deploy

```sh
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy extract-context
```

## Request

POST. `Authorization: Bearer <user_jwt>`. Body:

```json
{ "chatId": "uuid" }
```

## Response

```json
{
  "ok": true,
  "extracted_at": "2026-05-21T...",
  "situationalStateUpdated": true,
  "intentsCaptured": 2,
  "relationshipsTouched": ["rel-uuid-a", "rel-uuid-b"],
  "toolErrors": []
}
```

Or `{ "skipped": true, "reason": "..." }` for already-extracted or empty transcripts.

## Failure modes

- Chat not closed → 409. Close it first.
- Already extracted → returns `skipped: true` (200).
- Caller is not the chat owner → 403.
- Anthropic / DB errors → 502 / 500.
