# chat-respond

Conversational Intelligence backend per [ADR-0009](../../../../../docs/adr/0009-three-agent-architecture.md).

Receives a `chatId`, loads the transcript through the User's authenticated Supabase client (RLS enforces ownership), runs a multi-round tool-use loop with the read-only tool surface (Relationships, Contacts, Open Threads, Interactions, Calendar events, Groups, User Context), persists the final assistant turn to `chat_messages`, and **streams the response as Server-Sent Events** so clients can render incrementally.

**Read-only.** None of the tools mutate state. Every effect on the world still passes through a Candidate Action surfaced by Ambient Intelligence.

## Deploy

```sh
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy chat-respond
```

## Request

POST. Body:

```json
{ "chatId": "uuid" }
```

Header: `Authorization: Bearer <user_jwt>` (the Supabase JS client adds this automatically when invoking via `supabase.functions.invoke`).

## Response

`text/event-stream`. Events arrive in order as the agent works:

```
event: tool_use
data: {"id":"toolu_xxx","name":"list_relationships","input":{}}

event: tool_result
data: {"id":"toolu_xxx","preview":"[{\"id\":\"r-1\",\"name\":\"Sam\"}]"}

event: text_delta
data: {"delta":"You have one "}

event: text_delta
data: {"delta":"close relationship — Sam."}

event: done
data: {"message":{"id":"uuid","chat_id":"uuid","role":"assistant","content":"…","tool_calls":[…],"tool_call_id":null,"created_at":"…"}}
```

On failure a single `error` event is emitted instead:

```
event: error
data: {"message":"…"}
```

Consume the stream client-side via `chatsClient.respondStream(chatId)` from `@related/shared` — it parses SSE into a typed `ChatRespondEvent` async-iterable. The `done` event carries the persisted `chat_messages` row; the client appends it locally rather than refetching.

Direct `supabase.functions.invoke('chat-respond')` does **not** work for streaming — the SDK consumes the response. Use `fetch` with the User's JWT (the shared client handles this automatically).

## Tool surface (read-only)

- `list_relationships`, `get_relationship`
- `list_contacts`, `get_contact`
- `list_open_threads` (filter by relationship, direction, include_closed)
- `list_interactions` (filter by contact, status, time window)
- `list_calendar_events` (Google Calendar mirror — Calendar density signal)
- `list_groups`, `get_group`
- `get_user_context` (returns Goals & Values, Situational State, recent Transient Intent)

All read via the User-scoped Supabase client; RLS enforces owner-only.

## Failure modes

- Chat is closed → 409. Closed Chats are read-only; create a new Chat.
- Last message is not from the User → 409. Function only generates assistant turns in response to a User turn.
- `ANTHROPIC_API_KEY` missing → 500.
- Tool-use loop exceeds `MAX_TOOL_ROUNDS` (8) → degrades gracefully with a "narrow your question" reply.
