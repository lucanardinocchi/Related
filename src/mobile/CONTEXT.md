# Mobile — CONTEXT

Mobile-specific domain language for Related. Cross-cutting terms (User, Relationship, Contact, Group, Interaction, Open Thread, Candidate Action, Agent Pass, User Context, Salience, Ambient Intelligence, Conversational Intelligence, Extraction Pass, Chat) live in [src/shared/CONTEXT.md](../shared/CONTEXT.md) — use them exactly as defined there.

Per **ADR-0008** (web-primary for CRUD) and **ADR-0009** (three-agent architecture, mobile amendment), `src/mobile/` is the **voice-first capture surface** of Related — primarily a Conversational Intelligence client tuned for in-pocket use. Web is the primary surface for reflective CRUD work; see [src/web/CONTEXT.md](../web/CONTEXT.md).

## Primary role

**Voice-first Conversational Intelligence.** The User opens the app, taps the mic, talks about whatever is on their mind — a person they bumped into, a commitment they realised they have, how they're feeling about a relationship — and the **Conversational Intelligence** agent listens, reads context, and asks elicitation questions back. When the User closes the **Chat**, the **Extraction Pass** (ADR-0012) direct-writes relationship context — notes, interactions, comms, commitments — onto the relevant Relationship timelines with provenance.

This is mobile's reason for existing. Phones are where the User is most often in life-context-rich moments (walking from a meeting, on the train, just back from a coffee, lying in bed). Web is where they sit down to reflect; mobile is where they capture.

## Supporting roles

Mobile also covers capabilities that only make sense on a phone:

- **HealthKit Sleep signal** — iOS-only native module; feeds the agent's Sleep Inferred Signal per ADR-0001 and ADR-0005.
- **Conversational voice capture** — mic + STT on `MobileChatScreen` (Chat tab) transcribes into the composer; TTS plays assistant turns by default. User-initiated Engaged Pass voice (`VoiceSessionManager` → Pass LLM) was retired; Ambient Intelligence runs via baseline and triggered passes only.
- **Push notifications** — lock-screen and notification-tray surfaces for salient Candidate Actions.
- **Sign-in and onboarding** — initial Supabase Auth + per-device permission flows on the device that will hold the HealthKit grant.
- **Read-only browsing of state captured on web** — the User can glance at a Relationship while out, but editing is web-shaped work.

Anything CRUD-shaped (rich Contact profile editing, Commitment management, calendar planning, group composition) is **web-first** per ADR-0008. Mobile screens that pre-date ADR-0008 (e.g. `RelationshipDetailScreen`, `GroupDetailScreen`, `CalendarScreen`) keep working — no functional regression — but new CRUD features land on web, not here. The mobile screens will narrow in a follow-up.

## Tenancy

Mobile and web sign into the **same Supabase project** with the same User credentials. Per ADR-0006, Chats, messages, User Context, Open Threads, Relationships and every other entity are scoped by `owner_id` and isolated by RLS. Opening a Chat on mobile and closing it on web (or vice versa) is supported — both clients hit the same `chat-respond` and `extract-context` Edge Functions, the same `chats` / `chat_messages` tables, and the same User Context tables.

## Design system

Mobile uses the **same Notion-inspired design language** as web (per ADR-0008's web-primary aesthetic, applied across surfaces for consistency):

- Warm grays for surface (`#f7f6f3` rail, `#37352f` foreground, `#ebebea` hover).
- Outfit (sans) for UI / body, JetBrains Mono for data-shaped values.
- Calm resting view; affordances appear on press / focus.
- Pill buttons, soft radii, subtle borders only on framed inputs.

The pre-ADR-0008 Relationship detail styling (Strava orange, "InterTight" font family) is **legacy**; the Conversational Chat screen, the navigation chrome, and any newly-written mobile UI uses the shared Notion palette and Outfit type. Tokens are mirrored as JS constants since React Native cannot consume the web `globals.css` `@theme` block — see `src/mobile/src/ui/tokens.ts` (added with the Conversational Chat screen).

## Navigation: Talk to Claude → Chat tab

"Talk to Claude" entry points (Home tile, Relationship detail) navigate to the **Chat** tab with a relationship-scoped starter prompt — they do **not** open a separate Engaged Pass screen. Voice is Conversational-only: tap the mic in Chat, speak, review the transcript in the composer, then send.

## Cross-app contract

Anything that touches Supabase, Anthropic, OpenAI, or ElevenLabs lives in `@related/shared`, not in `src/mobile/`. Mobile composes shared clients into React Native screens; it owns nothing domain-shaped. The streaming Conversational client (`ChatStream`) lives in shared and is consumed by both web and mobile.
