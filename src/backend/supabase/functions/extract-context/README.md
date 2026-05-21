# extract-context

Extraction Pass per [ADR-0009](../../../../../docs/adr/0009-three-agent-architecture.md).

Runs over the transcript of a **closed** Chat and writes the User's self-narrative content into User Context. Triggered by the frontend immediately after the User closes a Chat.

## Write surface (only)

- `situational_state` (singleton per User — replace whole content)
- `transient_intent` (append, with `expires_at` = chat `closed_at` + 7 days)

**Will not** write to `goals_and_values` (User-authored only) or any operational entity (`interactions`, `open_threads`, `relationships`, …) — those remain gated by the Candidate Action invariant. See ADR-0009 sections (a) and (α).

## Idempotency

The function reads `chats.extracted_at`; if set, it returns `{ skipped: true, reason: "already extracted" }` without invoking the model. On success, it stamps `extracted_at = now()`. Empty transcripts are also stamped to avoid wasted future invocations.

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
  "toolErrors": []
}
```

Or `{ "skipped": true, "reason": "..." }` for already-extracted or empty transcripts.

## Failure modes

- Chat not closed → 409. Close it first.
- Already extracted → returns `skipped: true` (200).
- Caller is not the chat owner → 403.
- Anthropic / DB errors → 502 / 500.
