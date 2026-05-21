# Web — CONTEXT

Web-specific domain language for Related. Cross-cutting terms (User, Relationship, Contact, Group, Interaction, Open Thread, Candidate Action, Agent Pass, User Context, Salience, Ambient Intelligence) live in [src/shared/CONTEXT.md](../shared/CONTEXT.md) — use them exactly as defined there.

Per **ADR-0008**, `src/web/` is the **primary surface** of Related, carrying the full domain CRUD and the reflective workflows the User does sitting down at a desk. Mobile is the ambient-capture surface (HealthKit, voice, push); see [src/mobile/CONTEXT.md](../mobile/CONTEXT.md).

## Routes (top-level)

- `/relationships` — index of all Relationships (Contact-targeted and Group-targeted unified) with analytics, sort, and filter. Group-targeted Relationships render with a distinct icon from individual Relationships in the index.
- `/relationships/[id]` — individual (Contact-targeted) Relationship detail. Sections in fixed order: **Key Details** (Contact profile fields: phone, email, birthday, area, occupation, education, group memberships), **Recent Context** (last few Interactions + latest Candidate Set summary), **Analytics** (interaction counts, recency, open commitment counts), **Full History** (all Open Threads / Commitments, all Interactions, all Candidate Actions).
- `/groups/[id]` — group (Group-targeted) Relationship detail with mirrored sections.
- `/calendar` — unified Calendar view per the **Calendar (UI)** glossary entry: Interactions + external Google events with source badges, sortable filters, and analytics at the top.
- `/commitments` — the **Commitments view** per the shared glossary: filtered over Open Threads where `direction = me_owes_them`, with `origin` and `communication_status` as primary filter axes.
- `/agent` — **Conversational Intelligence** Chat surface (per ADR-0009). Text-primary on web with optional voice-in via Whisper; assistant turns stream token-by-token via SSE. Mobile has a peer Conversational surface (voice-primary) — both back onto the same `chat-respond` and `extract-context` Edge Functions and same `chats` / `chat_messages` tables; Chats sync across surfaces for the same User. Replaces the earlier `/talk` route (which redirects).
- `/context` — User Context editor (Goals & Values + Situational State); unchanged from prior to ADR-0008 functionally, retheme only.
- `/onboarding` — Onboarding flow (Connect Calendar step on web); unchanged functionally, retheme only.

## Design system

The web design system is **Notion-inspired** and lives in `src/web/components/ui/` plus the `@theme` block in `src/web/app/globals.css`. Key principles, used as decision shortcuts:

- **Not boxy.** Components lean on whitespace, dividers, and inline-hover affordances rather than borders and cards. Cards exist but are reserved for bounded content like analytics panels and modals.
- **Typography pair.** **Outfit** (geometric sans, loaded via `next/font/google`) for all UI and body text; **JetBrains Mono** for numbers, IDs, durations, and any data-like value the eye scans down a column.
- **Notion palette.** Warm grays (`#37352f` foreground, `#f7f6f3` sidebar, `#ebebea` hover) with Tailwind grays for utility. Status colours (draft / approved / sent / review / won / lost) are semantic and used sparingly.
- **Inline-editable.** Property rows reveal their edit affordance on hover; saving is implicit on blur where safe. No modal popovers for single-field edits.
- **Hover-reveal density.** Actions appear on row hover (`opacity-0 group-hover:opacity-100`) — the resting view is calm.

When adding a new primitive, the bar is "does this exist in the spec at [instructions.md](../../instructions.md) §Component Patterns / Form Elements / Buttons / Badges / Cards / Modals?" If yes, build it; if no, write a small example and propose it before adding.

## Cross-app contract

Anything that touches Supabase, Anthropic, OpenAI, or ElevenLabs lives in `@related/shared`, not in `src/web/`. New domain logic added on web is a signal to lift it into shared on the next pass.
