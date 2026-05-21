# chat-respond

Conversational Intelligence backend per [ADR-0009](../../../../../docs/adr/0009-three-agent-architecture.md).

Receives a `chatId`, loads the transcript through the User's authenticated Supabase client (RLS enforces ownership), **preloads a compact snapshot of the User's world** (Relationships, Open Threads, recent Interactions, User Context), runs a multi-round tool-use loop with the read-only tool surface for anything deeper, persists the final assistant turn to `chat_messages`, and **streams the response as Server-Sent Events** so clients can render incrementally.

**Read-only.** None of the tools mutate state. Every effect on the world still passes through a Candidate Action surfaced by Ambient Intelligence.

## File layout

The function is split across four modules so the prompt, context loader, and tool surface can evolve independently:

| File | Responsibility |
| --- | --- |
| `index.ts` | Request handler, message-history conversion, Anthropic streaming loop, SSE wire format. |
| `prompt.ts` | `SYSTEM_PROMPT_BASE` (cached) + `renderContextBlock(snapshot)` (per-turn). |
| `contextLoader.ts` | `loadConversationContext(supabase)` — one-shot snapshot of the User's world. |
| `tools.ts` | Read-only tool definitions and dispatcher. |
| `types.ts` | Shared interfaces. |

The two system blocks are sent together. `SYSTEM_PROMPT_BASE` carries `cache_control: ephemeral` so subsequent turns in the same chat hit Anthropic's prompt cache. The per-turn context block is not cached because Open Threads and Interactions can change between turns.

## What the agent does

Two responsibilities (codified in `prompt.ts`):

1. **Elicit every relevant detail.** When the User raises a person, event, plan, or feeling, the agent works toward who / when / where / what happened / how it landed / what they want / what's different. It picks the highest-leverage gap and weaves it into one natural question rather than stacking three.
2. **Infer from preloaded context + earlier turns.** The context block exposes Relationships, Groups, Goals & Values, Situational State, recent Transient Intent, Open Threads, and recent Interactions. The agent cross-references new utterances against this snapshot and proposes 1–2 inferences inside its next question.

The agent is still read-only on app state. The Extraction Pass (`extract-context`) routes self-narrative into Situational State and Transient Intent after the Chat closes. The Ambient Intelligence agent (`engaged-pass`) proposes Candidate Actions.

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
- Context preload throws → the function logs a warning and continues with an empty snapshot, leaving the agent to fall back on tools. One failed table is never allowed to break a chat turn.

## Context preload caps

The snapshot is meant to be a token-efficient slice, not the full world. Tools fill in the rest.

| Section | Cap | Window |
| --- | --- | --- |
| Relationships | 200 | — |
| Groups | 50 | — |
| Open Threads | 50 | open only |
| Recent Interactions | 100 | last 30 days |
| Transient Intent | 20 | non-expired |
| Goals & Values | unbounded | — |
| Situational State | 1 row (singleton) | — |

When any section's underlying total exceeds the cap, the rendered block tells the model how many remain and which tool to call for the full list.
