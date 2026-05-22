# extract-context

Relationship context **Extraction Pass** per [ADR-0012](../../../../../docs/adr/0012-relationship-context-extraction.md) (amends ADR-0009).

Runs over the transcript of a **closed** Chat — Conversational (`source='conversational'`) or Pocket import (`source='pocket'`) — and **direct-writes** structured relationship context with provenance.

## Write surface

| Tool | Context family | Storage |
|------|----------------|---------|
| `log_note` | Note | `interactions` (`kind='note'`) |
| `log_interaction` | Interaction | `interactions` |
| `log_comms` | Comms | `interactions` (channel kinds) |
| `open_commitment` | Commitment | `open_threads` |

Every row is stamped with `capture_source` (`conversational_extraction` | `pocket_extraction`) and `source_chat_id`.

**Will not** write Goals & Values, role/cadence, or Candidate Actions.

Supports **Contact and Group Relationships** — tools take `relationship_id`; group-mode interactions use `extraction_create_interaction` with `p_group_id`.

## Triggers

- User closes a Conversational Chat → client calls `ChatsClient.extract()`
- Pocket import completes → `invokeExtractContext` (service role + `ownerId`)

## Idempotency

Gates on `chats.extracted_at`. Re-invocations return `{ skipped: true }`.

## Deploy

```sh
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy extract-context
```

Apply migration `20260532000001_extraction_provenance.sql` first.

## Request

POST. `Authorization: Bearer <user_jwt>` or service role with body:

```json
{ "chatId": "uuid", "ownerId": "uuid" }
```

## Response

```json
{
  "ok": true,
  "extracted_at": "2026-05-22T...",
  "notesLogged": 1,
  "interactionsLogged": 2,
  "commsLogged": 0,
  "commitmentsOpened": 1,
  "toolErrors": []
}
```
