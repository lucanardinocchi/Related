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
A person the User knows. Identified by name and one or more channels (phone, email, etc.). A Contact is **not** a user of the app — they are a referenced person, not an account.
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
The project's name for the central agent pattern: continuous, autonomous, high-frequency, low-cost reasoning that runs in the background against each Relationship without User prompting. The User engages on their own schedule and finds fresh thinking already done.
_Avoid_: Background job, daemon, watcher (as user-facing terms).

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
- `created_at`, `closed_at` (null while open)
- Links to **one or more Relationships** (one Open Thread can span multiple Relationships, e.g., an introduction between two Contacts; closing it closes it on all)

## Relationships

- A **User** has many **Relationships**.
- Each **Relationship** has exactly one **Contact** on the other end.
- A **Contact** can exist without a **Relationship** (raw address-book entry), but the app's value is in the **Relationship** wrapping it.
- An **Interaction** is associated with **one or more** **Contacts**, and therefore touches one or more **Relationships** simultaneously (e.g., a group dinner with Sam, Priya, and Jules is one Interaction that updates three Relationships).
- **Ambient Intelligence** runs **Agent Passes** continuously, one per **Relationship**, each pass reading **User Context** and producing options for that Relationship.

## Flagged ambiguities

- "Contact-centric" in the original brief was resolved to mean _the UI organises around the person_, while the underlying record being acted on is the **Relationship**. Both terms stay, with distinct meanings.
