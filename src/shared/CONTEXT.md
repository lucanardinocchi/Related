# Shared — CONTEXT

Cross-cutting domain language for Related. These terms are the same in mobile, backend, and (forthcoming) web.

## Language

**User**:
The account holder. The single person whose perspective the app is built around. Per **ADR-0006**, Related is a multi-tenant SaaS — many Users exist concurrently in the same system, but each User's view of the world is single-User-shaped. RLS isolates per-User data; no cross-User Relationships, Groups, or Interactions exist in v1.
_Avoid_: Owner, account.

**Tenant** (system-level only):
Implementation term for "one User's isolated data slice". Used in system docs and RLS / Edge Function code, not in product copy. A Tenant maps 1:1 to a User; every row in every table carries `owner_id` which the RLS policies gate on. Edge Functions iterate tenants when running daily collectors; UI code never names this — to the User everything is "my data."
_Avoid_: Org, workspace, customer (these imply multi-User-within-Tenant, which Related does not have).

**Integration**:
A per-User OAuth-bound external account the agent reads from (Google Calendar) or a per-User platform-permissioned signal source (iOS HealthKit). Stored in `user_provider_tokens` (OAuth) or granted via on-device permission flow (HealthKit). Connected during **Onboarding**; revocable. Each Integration is the User's own — there is no shared Integration across Users.

**Onboarding**:
The first-run flow that brings a new User from sign-up to fully configured. v1 steps: (1) Supabase Auth sign-up, (2) **Connect Google Calendar** (OAuth — Calendar density signal), (3) **Grant HealthKit access** (iOS only — Sleep signal), (4) add the first few Contacts. State tracked in `onboarding_state`. Steps 2 and 3 are skippable but degrade the agent's signal coverage.

**Contact**:
A person the User knows. Identified by name and one or more channels (phone, email, etc.), plus optional profile fields the User curates over time: **birthday**, **area** (free-text location, typically a suburb or neighbourhood), **occupation**, **education**. A Contact is **not** a user of the app — they are a referenced person, not an account. The richer profile fields are surfaced on the web Relationship detail page (per ADR-0008) and feed agent reasoning passively.
_Avoid_: Friend, person, lead, account.

**Relationship**:
The bond from the User to either a single Contact or a single Group. The first-class domain entity. Carries the state of the bond itself (not just metadata about the target). All Open Threads, Interaction history, Candidate Sets, and agent reasoning attach to a Relationship. `Relationship.target` is **polymorphic** — either a Contact or a Group — but the Relationship shape is uniform across both. Group-targeted and Contact-targeted Relationships are surfaced on **separate UI surfaces** even though they share an entity type.
_Avoid_: Connection, friendship, link.

**Group**:
A named collection of Contacts (e.g., "college friends"). First-class entity. The User has a Relationship to a Group the same way they have one to a Contact — Groups carry their own Open Threads, Candidate Sets, and Interaction history, distinct from those of their member Contacts. A Contact can belong to multiple Groups. Membership is User-curated, not inferred.
_Avoid_: Tag, list, circle (these imply organisational labels rather than a first-class entity with its own state).

**Interaction**:
A single moment of contact between the User and one or more Contacts and/or a Group. Has a time, a kind (call, text, coffee, dinner, catch-up, birthday, etc.), notes, and a status (planned / occurred / missed). Past and future are the same shape; the difference is `time` and `status`. The calendar view is a filter over Interactions, not a separate entity.

When an Interaction is explicitly linked to a **Group**, it touches both the Group Relationship **and** each member Contact's individual Relationship — one logged Interaction updates multiple layers. Group-mode is **explicit** (set at capture time, e.g., the User said "group dinner with college friends"), never inferred from member overlap. A 1:1 coffee with Sam who happens to be in the college friends Group does not update the Group Relationship.
_Avoid_: Event, catch-up, touchpoint, meeting (as standalone nouns — "catch-up" is a valid `kind` value, not a separate type).

**Ambient Intelligence**:
The project's name for the central agent pattern: continuous, autonomous, high-frequency, low-cost reasoning that runs in the background against each Relationship without User prompting. The User engages on their own schedule and finds fresh thinking already done. One of the three agents in the system (per **ADR-0009**), alongside **Conversational Intelligence** and **Extraction Pass**. Ambient is the only one that emits **Candidate Actions**.
_Avoid_: Background job, daemon, watcher (as user-facing terms).

**Conversational Intelligence**:
The chat-surface agent (per **ADR-0009**). The User opens a **Chat** and turn-takes with the model. Conversational reads from app state via tool calls (Relationships, Contacts, Open Threads, Interactions, Calendar, Groups, User Context) but is **strictly read-only on app state** — it cannot create or mutate Interactions, Open Threads, Relationships, Contacts, Groups, or any User Context flavour. Its job is to surface what the User has, ask questions to elicit Transient Intent and Situational State, and reflect back. Reactive only — never speaks first; a new Chat is empty until the User types or speaks.

Available on **two peer surfaces**:
- **Web** (`/agent`) — text-primary, mic optional. Used for desk-shaped reflective conversations.
- **Mobile** (Chat tab in `src/mobile/`) — voice-primary, text fallback, TTS-default for assistant turns. Used for in-pocket / on-the-go context capture. **This is mobile's primary purpose** per the ADR-0009 mobile amendment.

Both surfaces back onto the same `chat-respond` Edge Function and same `chats` / `chat_messages` tables — Chats sync across web and mobile for the same User per ADR-0006 multi-tenant rules.
_Avoid_: Chatbot, copilot (these flatten the read-only invariant).

**Extraction Pass**:
A post-processing agent (per **ADR-0009**, amended 2026-05-21) that runs over the transcript of a closed **Chat**, sorts it by Relationship, and writes the resulting narrative back to the right places. Triggered exactly once when a Chat closes. Writes to: **Transient Intent**, **Situational State** (User-wide self-narrative), and **Relationship Context** (per-Relationship narrative for both Contact- and Group-targeted Relationships). Does not write to **Goals & Values** (User-authored only) or to operational entities (Interactions, Open Threads, Relationship role/cadence — Candidate Action invariant). Named "Pass" to parallel **Agent Pass**: same shape (input → reasoning → write), different input type (transcript, not Relationship state). Idempotent on the Chat: a Chat can only be extracted once.
_Avoid_: Summariser, analyser (Extraction is structured-write, not summarisation).

**Relationship Context**:
A per-Relationship narrative paragraph — the agent's understanding of what is currently true about a single bond. One singleton row per **Relationship** (Contact or Group), holding 3–6 sentences. Written by the **Extraction Pass** when it sorts a closed Chat transcript by Relationship (per the ADR-0009 2026-05-21 amendment), and read by the next **Agent Pass** alongside **User Context**. The Extraction Pass replaces the content wholly each run, preserving still-true content, removing contradicted, adding new — same merge contract as Situational State.

Narrative state, **not** action state. Relationship Context describes ("Sam has been quiet this week; the group dinner felt strained"). Logging an Interaction or opening an Open Thread is still a **Candidate Action** the User picks — the Candidate Action invariant is unchanged for those surfaces. The User may also edit Relationship Context directly when the agent mis-attributes.

When the transcript discusses a **Group**: the holistic chunk lands on the Group Relationship's Context; member-specific fragments fan out additionally to each member Contact's Relationship Context. When a name is ambiguous (matches more than one Contact), the fragment is written to **all** plausible matches with an inline `[possibly also: Other Name]` marker — Conversational Intelligence is expected to disambiguate live during the Chat, and Extraction over-attributes as a backstop.
_Avoid_: Relationship notes, profile, bio (these flatten the per-Pass merge contract and the agent-managed-but-User-correctable ownership model).

**Chat**:
A bounded conversation between the User and **Conversational Intelligence**. First-class domain entity. Not tied to any single Relationship — Chats are free-form and global to the User. The agent's context for any turn is the full message history of **the current Chat only**; cross-Chat history is never sent to the model. Each Chat is the unit of input to one **Extraction Pass**.

Lifecycle is explicit-close (per ADR-0009): a Chat is `open` (writable, agent responds, Extraction not yet run) until the User clicks "New Chat" or archives it, at which point it becomes `closed` (read-only, Extraction runs exactly once). There is no idle close — a User who walks away mid-Chat picks up where they left off. **Transient Intent** extracted from a Chat decays from the Chat's `closed_at` timestamp, not from the underlying message timestamps.
_Avoid_: Conversation, thread (overloaded — "Open Thread" already means something else), session (overloaded — "session" is used for Engaged Pass voice).

**Agent Pass**:
One execution of the Ambient Intelligence loop against a single Relationship. Inputs: the Relationship's current state and history + the full **User Context** (all four flavours, with their current salience) + current Open Threads. Output: a refreshed set of Candidate Actions for the User.
_Avoid_: Tick, run, evaluation.

There are three tiers of Pass, distinguished by what triggers them and which model runs them:

- **Baseline Pass** — scheduled, every 6 hours per Relationship, uniform across all Relationships. Haiku-class model.
- **Triggered Pass** — runs whenever **new context** is added that affects a Relationship (a new Interaction logged, a Goal or Value edited, an Inferred Signal shift, an approaching planned Interaction, etc.). Acts on the affected Relationship(s) only. Haiku-class model.
- **Engaged Pass** — runs synchronously when the User starts a voice session focused on a Relationship. Inputs include the live **Transient Intent** captured in that session. Sonnet-class model.

**User Context**:
Umbrella term for the four sources of state that describe the User and feed every Agent Pass alongside the Relationship being reasoned about. Composed of four distinct flavours, each stored separately, each with its own lifecycle. Their relative influence on agent reasoning is **dynamically weighted** by their current salience — none is permanently dominant.

- **Transient Intent**: ephemeral, captured in chat sessions with the agent. Decays. "Right now I want to plan my birthday."
- **Situational State**: medium-term, evolves over weeks/months. Reflects where the User is in life. "Just moved to Sydney." Updated explicitly by the User and silently by the agent when surfaced in conversation.
- **Goals & Values**: long-running, User-authored, edited explicitly when the User decides to add or change one. "Be more present with family." Not inferred.
- **Inferred Signals**: ambient, system-observed signals about the User's current situation. v1 ships **two signals only**: **Calendar density** (7-day forward window, prompt focus on the next 72 hours) and **Sleep** (last 3 days of sleep, prompt focus on the next 48 hours). Both are pulled at a **daily fixed schedule (10 AM User local time)** — explicitly **independent of Agent Pass timing**. **Raw data is persisted** in the User's DB for the relevant window; the agent reads from local storage on every Pass rather than calling external APIs. Sleep source is HealthKit on iOS in v1; Android (Health Connect / Google Fit) is deferred. Location and time-of-day were considered and **explicitly excluded** from v1.

_Avoid_: Profile, preferences, settings (these flatten what is intentionally a multi-source, dynamically-weighted model).

**Salience**:
The current weight a given **User Context** flavour (or a specific entry within one) carries in agent reasoning. Not fixed. A recent dramatic life change has high salience; a long-steady goal has low. Determined at Agent Pass time, not at write time.

**Candidate Action**:
The output unit of an **Agent Pass**. A typed, structured proposal the agent surfaces for the User to accept, modify, or decline. The User can edit any field of a Candidate Action before accepting it. The agent never auto-executes — every effect on the world passes through a User pick. Common types include scheduling or logging Interactions, opening or closing Threads, sending messages, updating Relationship state, and `DoNothing`. **There is no `Snooze` type** — Ambient Intelligence is meant to adapt to User behaviour, not be muted. **No cap on candidates per Pass** — the agent emits whatever set is genuinely useful.

The **set of available action types is shaped by the Relationship's target**: Group-targeted Relationships have a partially distinct action ontology from Contact-targeted ones (e.g., "plan a group dinner" makes sense for a Group; "send a birthday note" does not). The agent loop infrastructure (cadence, model tier, three-tier Pass model) is identical regardless of target — only the action ontology differs.
_Avoid_: Suggestion, recommendation, prompt (these flatten the structured nature; a Candidate Action has a type and payload, not just text).

**Candidate Set**:
The current Candidate Actions for a Relationship, replaced (with strong continuity bias) by each Agent Pass. Each Pass reads the previous Candidate Set and the User's response to it (picked / edited / declined / ignored); default behaviour is to keep candidates unless something materially changed. When a candidate is replaced, the agent records a one-line `why` string visible on the card.

**Open Thread**:
A commitment, pending question, owed reply, or unresolved item attached to one or more Relationships. First-class — the agent reasons over current Open Threads on every Agent Pass. An Open Thread is **resolved** by being closed (`CloseThread` Candidate Action). New Open Threads are typically born from an Agent Pass surfacing an `OpenThread` Candidate Action, but can also be created directly by the User.
_Avoid_: Todo, task, reminder (those imply User-owned work — an Open Thread is a state of the Relationship, not a personal todo).

Shape:
- `description` — short text
- `direction` — exactly one of `me_owes_them` or `they_owe_me`; never mutual
- `origin` — exactly one of `asked_of_me` or `self_led`, or `null`. Meaningful only when `direction = me_owes_them` (i.e. the thread is a **Commitment** the User has to someone). `asked_of_me` means the other person asked; `self_led` means the User chose to do this themselves. Null on `they_owe_me` threads — origin is undefined there.
- `communication_status` — exactly one of `not_communicated` or `confirmed`. Whether the User has yet told the other person about this thread (e.g. they made a self-led commitment in their head but haven't told the person — `not_communicated` — versus they've explicitly said "I'll do X for you" — `confirmed`). Defaults to `not_communicated`. Meaningful on `me_owes_them` threads; on `they_owe_me` it's typically `confirmed` (the other person asked, so by definition communicated).
- `created_at`, `closed_at` (null while open)
- Links to **one or more Relationships** (one Open Thread can span multiple Relationships, e.g., an introduction between two Contacts; closing it closes it on all)

**Commitments view**:
The web `/commitments` page (per ADR-0008). Not a separate domain entity — it is a **filtered view over Open Threads** where `direction = me_owes_them`, surfacing the `origin` and `communication_status` axes as primary filters. Used by the User to see at a glance: what have I committed to, asked-of-me vs self-led, and have I told the person yet. Closing a commitment from this view closes the underlying Open Thread.
_Avoid_: Commitments table, Commitments entity (this is presentation, not a schema concept; the storage is still `open_threads`).

**Calendar (UI)**:
On web, the `/calendar` page is a **unified timeline** of (a) first-class **Interactions** the User has logged or scheduled, and (b) read-only **external calendar events** sourced from `inferred_signal_calendar` (Google Calendar). Each entry is badged by source. Interactions remain editable through their existing CRUD; external events are read-only mirrors of what the agent sees in its Calendar density signal. The distinction matters: editing an Interaction changes the agent's behaviour on the next Pass; external events change only when the upstream Google Calendar changes and the daily `sync-calendar` cron picks them up.
_Avoid_: Conflating "Calendar event" with "Interaction". An Interaction is User-curated relationship state; an external Calendar event is observed background context.

## Relationships

- A **User** has many **Relationships**.
- Each **Relationship** has exactly one **Contact** on the other end.
- A **Contact** can exist without a **Relationship** (raw address-book entry), but the app's value is in the **Relationship** wrapping it.
- An **Interaction** is associated with **one or more** **Contacts**, and therefore touches one or more **Relationships** simultaneously (e.g., a group dinner with Sam, Priya, and Jules is one Interaction that updates three Relationships).
- **Ambient Intelligence** runs **Agent Passes** continuously, one per **Relationship**, each pass reading **User Context** and producing options for that Relationship.

## Flagged ambiguities

- "Contact-centric" in the original brief was resolved to mean _the UI organises around the person_, while the underlying record being acted on is the **Relationship**. Both terms stay, with distinct meanings.
