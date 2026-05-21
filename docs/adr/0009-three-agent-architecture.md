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

## Amendment 2026-05-21 — Extraction routes per-Relationship narrative

The original ADR rejected option (3) — *"Operational entities (Interactions, Open Threads, Relationship state) writeable by Extraction"* — on the Candidate Action invariant ground. That rejection was correct for **action-shaped** operational entities (logging an Interaction, opening an Open Thread, mutating role/cadence) and stands unchanged. It was **wrong for per-Relationship narrative state**: when the User says *"Sam seemed off in the group dinner; he's been quiet all week"*, the right home for that observation is a per-Relationship narrative store, not the User-wide Situational State (which is about the User, not Sam) and not a 7-day Transient Intent (which decays before next month's catch-up).

The Extraction Pass write surface is now split into three named tiers:

1. **User Context** (unchanged): `situational_state`, `transient_intent`. About the User. Same merge contract as before.
2. **Relationship Context** (new): a per-Relationship narrative — one singleton row per Relationship (Contact or Group), keyed by `relationship_id`, holding a 3–6 sentence paragraph that the Extraction Pass replaces wholly each run (preserving still-true content, removing contradicted, adding new). This is **narrative state** — the agent's understanding of what's currently true about the bond. It does **not** propose actions, log past events, or change relationship structure (role, cadence, target). It is read by the next Ambient Pass alongside User Context.
3. **Operational entities** (unchanged invariant): `interactions`, `open_threads`, and the structural columns on `relationships` (role, cadence) remain gated by the Candidate Action invariant. If the User says *"I had coffee with Sam yesterday"*, the next Ambient Pass — informed by the richer Relationship Context Extraction just wrote — will surface a `LogInteraction` Candidate. The User still picks. The world does not mutate without User approval. This is the line that does not move.

The distinction is **narrative vs. action**: narrative describes; action commits. Extraction may now describe at the Relationship level; only the User (via a Candidate pick) can commit.

### Why this is consistent with the original ADR's spirit

The original ADR identified three User intents — proactive suggestions (Ambient), thinking out loud with a knowledgeable counterpart (Conversational), and what was said informing future reasoning (Extraction). Routing per-Relationship narrative into Relationship Context is the cleanest expression of the third intent: a User talking about Sam in a Chat *should* shape how the agent reasons about Sam on the next Pass, with no further User action required. Forcing that content through a User-wide Situational State (it isn't about the User) or through 7-day Transient Intent (the time horizon is wrong) was distorting the User Context flavours to do a job they weren't designed for.

### Sorting and ambiguity rules for the Extraction prompt

The Extraction Pass now sorts the transcript by Relationship in passes:

- **Group sort.** For each Group mentioned, capture the chunk of transcript about the Group as a whole into that Group Relationship's Context.
- **Member fan-out.** Where a Group-context chunk also speaks about a specific member's individual action or state, capture that fragment additionally into that member Contact's Relationship Context. The Group keeps the holistic chunk; the member gets the individually-relevant slice.
- **Direct individual mentions.** Anything said about a Contact outside any Group context goes straight to that Contact's Relationship Context.
- **User self-narrative.** Anything about the User's own life routes to `situational_state` as before. Ephemeral User intents route to `transient_intent`.

**Naming ambiguity is handled in two places**:

- **At conversation time** — Conversational Intelligence detects when a name the User just used matches more than one Contact and asks the User to clarify before the conversation continues. The tools required (`list_contacts`, `list_relationships`) already exist on `chat-respond`; this is a prompt-only rule.
- **At extraction time, as a backstop** — if ambiguity remains in the transcript, Extraction writes the content into **all plausibly-matching Relationships' Contexts**, with a clear inline marker (e.g. `[possibly also: Sam Lee]`) so the next Ambient Pass and the User see the tentative attribution. Better to over-attribute and let the User correct than to drop the context.

### Schema impact

- New table `relationship_context` (one row per Relationship; singleton on `relationship_id`) shipped as an additive migration.
- New `RelationshipContextClient` in `@related/shared`.
- The `extract-context` Edge Function gains read tools (mirroring `chat-respond`'s read surface) plus one new write tool `upsert_relationship_context`. The prompt is rewritten around the sort passes above.
- `chat-respond` gains a disambiguation rule in its system prompt; no schema or tool changes.
- `PassEngine` enriches `AgentPrompt.relationship` with the per-Relationship narrative so the next Pass actually reads what Extraction wrote.
