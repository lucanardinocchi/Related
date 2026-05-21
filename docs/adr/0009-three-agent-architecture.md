# Three-agent architecture: Ambient + Conversational + Extraction

The agent layer of Related is split into **three distinct agents**, each with a different role, write surface, and trigger. This ADR establishes the split and the invariants between the three.

1. **Ambient Intelligence** (existing — see CONTEXT.md and the `engaged-pass` Edge Function). Continuously runs Agent Passes per Relationship; emits Candidate Sets the User accepts/edits/declines. The agent never auto-executes — every effect on the world passes through a User pick.
2. **Conversational Intelligence** (new). The chat surface at `/agent`. Reads from app state via tool calls; asks questions to elicit context. **Read-only** on app state. Reactive only — never speaks first.
3. **Extraction Pass** (new). A post-processing agent that runs over the transcript of a closed Chat, extracts what the User has said about themselves, and writes it to **User Context**. Writes only to **Transient Intent** and **Situational State**.

The three agents share a single LLM tool surface but have non-overlapping write rights, encoded as separate tool sets. The Conversational and Extraction agents each get their own Edge Function (`chat-respond`, `extract-context`); Ambient continues to use `engaged-pass`.

## Considered options

- **Single conversational agent that reads and writes (Claude-style).** Rejected: violates the existing Candidate Action invariant — *"the agent never auto-executes — every effect on the world passes through a User pick"* — which is load-bearing for User trust and cannot be silently dropped without an explicit ADR retiring it. A write-capable conversational agent would also bypass Ambient's continuity bias and Candidate Set state, fragmenting the agent's view of "what has the User decided about this Relationship."
- **Conversational agent that proposes Candidate Actions inline (hybrid).** Rejected: makes the chat surface a second Ambient surface — same paradigm, different shell. Loses the distinct value of a Conversational surface (free-form Q&A about your own data without the framing of "what should I do about Sam"). Also doubles the Candidate-Set write paths (Ambient on schedule vs. Conversational on turn), which complicates dedup and provenance.
- **Two-agent split: Ambient + a single combined Conversational/Extraction.** Rejected: the two have fundamentally different triggers (per turn vs. per closed Chat), different inputs (live conversation vs. transcript), different prompts ("ask the User a question" vs. "extract structured state"), and different write rights (none vs. User Context). Combining them into one prompt forces it to be both at once, which makes either job worse.
- **Goals & Values writeable by Extraction.** Rejected: CONTEXT.md states G&V is *"long-running, User-authored, edited explicitly when the User decides to add or change one. Not inferred."* Even a "draft" lane for Extraction-nominated G&V erodes that — surfacing a proposed Goal influences the User's self-narrative. Self-narrative content from Chats routes to Situational State, which is exactly what SS is for.
- **Operational entities (Interactions, Open Threads, Relationship state) writeable by Extraction.** Rejected: same Candidate Action invariant as option 1. If a User says *"I had coffee with Sam yesterday"* in chat, the next Ambient Pass — informed by the richer Situational State that Extraction wrote — will surface a `LogInteraction` Candidate. The User still picks. No state mutates without User approval.

## Why

The three roles fall out of a single observation: a User talking to the agent is doing **three different things at once**, and lumping them produces a worse agent for each.

1. They want **proactive suggestions** that have already been thought through (Ambient, runs whether or not the User is here).
2. They want a place to **think out loud** with a knowledgeable counterpart who has access to their data (Conversational, read-only — the User wants questions back, not writes).
3. They want what they said while thinking out loud to **inform the agent's future reasoning** (Extraction, writes the User's mental state into User Context where Ambient will read it on the next Pass).

Splitting the three preserves three invariants that would otherwise collide:
- **Operational state changes through User picks only** (Candidate Action invariant).
- **Goals & Values are User-authored** (CONTEXT.md).
- **The chat experience asks questions, not "should I do X" prompts** (Conversational is not a Pass surface).

The architecture also produces clean state lifecycles:
- **Open Chat** → User and Conversational turn-take. No Extraction yet. Transcript lives in `chat_messages`.
- **Closed Chat** → read-only. Extraction Pass runs exactly once over the full transcript and writes to User Context. The Chat becomes a historical artifact.
- **Transient Intent** extracted from a Chat decays from the Chat's `closed_at`, not from the message timestamps — so an open Chat doesn't have a decay clock.

## Consequences

- **Three new domain terms** in `src/shared/CONTEXT.md`: **Chat**, **Conversational Intelligence**, **Extraction Pass**. The existing **Ambient Intelligence**, **Agent Pass**, **Candidate Action**, **User Context**, and **Transient Intent** entries are unchanged but now compose explicitly with the new ones.
- **New `chats` and `chat_messages` tables** with strict owner-only RLS. `chats` carries `id, owner_id, title (nullable, auto-generated then User-renameable), created_at, closed_at (nullable while open)`. `chat_messages` carries `id, chat_id, owner_id, role (user/assistant/system/tool), content, tool_calls (jsonb, for inline tool-use rendering), tool_call_id (nullable, for tool-result messages), created_at`. Closed chats are read-only by application convention; the DB doesn't enforce immutability in v1 (RLS could be tightened in a follow-up if it bites).
- **New `ChatsClient` in `@related/shared`.** Mirrors the existing client style (one class per top-level concept; framework-agnostic). Methods: `listChats`, `getChat`, `createChat`, `closeChat`, `renameChat`, `deleteChat`, `appendMessage`, `listMessages`.
- **New `chat-respond` Edge Function (PR 2).** Receives a Chat ID, loads the full message history, sends to the Anthropic Sonnet-class model with the read-only tool surface (`list_relationships`, `get_relationship`, `list_contacts`, `get_contact`, `list_open_threads`, `list_interactions`, `list_calendar_events`, `list_groups`, `get_group`, `get_user_context`), streams the assistant turn (and any tool calls) back via SSE. Tool calls render inline in the UI with collapsible details (Claude Code style).
- **New `extract-context` Edge Function (PR 3).** Triggered when a Chat closes. Receives the full transcript, prompts the model to extract Transient Intent and Situational State updates, and writes via `UserContextClient`. **No other writes.** Idempotent on the Chat — closing fires extraction exactly once; replays are no-ops.
- **New `/agent` UI shell (this PR).** Two-pane layout inside the existing authed wrapper: Chat list on the left, current Chat thread on the right. New Chat button creates an open Chat; selecting an existing Chat opens its thread. Composer appends User messages; assistant responses are placeholder until PR 2 wires `chat-respond`. The legacy `/talk` redirect to `/agent` is unchanged.
- **`/talk` voice infrastructure preserved.** The Whisper STT and ElevenLabs TTS adapters, browser MediaRecorder pipeline, and `voice-stt`/`voice-tts` Edge Functions stay. PR 4 unifies them into the new `/agent` composer (mic button → STT → assistant turn → optional TTS playback). Mobile voice flows are out of scope for this ADR; they continue to use the existing `engaged-pass` Engaged Pass.
- **Web + mobile, peer surfaces (amended 2026-05-21).** The Conversational and Extraction surfaces ship on **both web and mobile** — they are peer surfaces backed by the same `chat-respond` and `extract-context` Edge Functions and the same `chats` / `chat_messages` tables. The original "web-only for v1" line in this ADR is **retracted** — re-reading mobile's purpose with the project sponsor, the mobile app's primary value is voice-first context capture into the Conversational surface (the moment when life context is freshest is in-pocket, not at a desk), and gating that behind a v2 ADR was the wrong call. Web remains text-primary; mobile is voice-primary with TTS-default playback of assistant turns. Engaged Pass / `engaged-pass` continues to coexist on mobile as a separate Relationship-scoped voice surface (the existing `AgentScreen`); the new mobile Chat tab sits alongside it.
- **No retirement of Engaged Pass.** Despite the URL collision implied by ADR-0008's *"`/agent` (text+voice chat, replaces `/talk`)"*, this ADR does not retire the Engaged Pass concept — Engaged Pass continues to fire when the User starts a voice session focused on a single Relationship. ADR-0008's framing is amended: `/agent` is the **Conversational Intelligence** surface (free-form, global, read-only), and Engaged Pass remains a Pass tier within Ambient Intelligence (Relationship-scoped, voice, Sonnet-class). They do not overlap; they answer different questions.
- **No data migration.** Additive schema change. Existing Users will have zero Chats until they create one.
