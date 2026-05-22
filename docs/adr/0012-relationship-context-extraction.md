# Relationship context extraction: direct write with provenance

**Amends [ADR-0009](0009-three-agent-architecture.md).** ADR-0009 defined the Extraction Pass as a User Context writer (Situational State + Transient Intent only) and rejected writes to operational entities on Candidate Action grounds. That framing is **retracted** for transcript capture: when the User speaks — in a Conversational Chat or via a Pocket import — they are stating **facts about their Relationships**, not asking the agent to speculate. Those facts should land on the Relationship timeline directly.

The **Candidate Action invariant is unchanged for Ambient Intelligence** — scheduled Passes still propose; the User still picks. Extraction is a separate, transcript-triggered write path with its own trust model: *the User said it; we structured it.*

## Role

The **Extraction Pass** (`extract-context` Edge Function) runs exactly once per **closed** Chat. Its input is the full transcript of either:

1. **Conversational Chat** — turn-taking between the User and Conversational Intelligence (`chats.source = 'conversational'`).
2. **Pocket import** — a closed Chat built from a Pocket transcription (`chats.source = 'pocket'`).

Its job: read the transcript, resolve people and groups against the User's Relationships, and **direct-write** structured relationship context:

| Context family | Storage | Extraction tool |
|---|---|---|
| **Note** | `interactions` (`kind = 'note'`) | `log_note` |
| **Interaction** | `interactions` (event / meeting / activity / …) | `log_interaction` |
| **Comms** | `interactions` (channel kinds: `whatsapp`, `imessage`, …) | `log_comms` |
| **Commitment** | `open_threads` (Commitments view = filtered open threads) | `open_commitment` |

The Extraction Pass **does not** write Goals & Values (User-authored only, per CONTEXT.md). It **does not** emit Candidate Actions. It **does not** replace Conversational Intelligence — that agent stays read-only during the Chat; extraction runs after close (or immediately after Pocket import creates a closed Chat).

## Direct write

Extracted rows are persisted immediately — no review queue, no Candidate Set. Rationale:

- Transcript capture is **User-authored primary source material**, not agent inference about what the User should do.
- Delaying behind a pick step would leave Relationship timelines stale while the User has already moved on — especially on mobile / Pocket capture.
- Ambient Intelligence continues to propose *actions*; extraction records *what happened*.

Conservative extraction is enforced in the **prompt** (don't invent; skip ambiguous name matches; prefer no tool call over a wrong Relationship link), not by gating writes behind UI confirmation.

## Provenance

Every Extraction-written row carries provenance so the Relationship detail UI can show **where a timeline entry came from**:

- `capture_source` — `'manual' | 'conversational_extraction' | 'pocket_extraction'`. Manual rows (User typed in Add Context) default to `'manual'`.
- `source_chat_id` — FK to `chats.id` when the row was created by Extraction; null for manual capture.

The web Relationship / Group detail timeline surfaces this as a source badge (e.g. "From chat", "From Pocket"). Manual entries show no badge.

Provenance is **immutable after insert** in v1 — editing content does not rewrite source.

## Individual and Group Relationships

Extraction tools take **`relationship_id`** (Contact-targeted or Group-targeted). The dispatcher resolves:

- **Contact Relationship** → `create_interaction` 1:1 path (`p_contact_ids = [target_contact_id]`).
- **Group Relationship** → Group-mode path (`p_group_id = target_group_id`, member contacts linked at capture time per ADR-0004).

`open_commitment` accepts one or more `relationship_ids` — same semantics as manual Open Thread creation (one thread can span multiple Relationships).

Entity resolution uses a preloaded Relationship directory in the prompt. When a name is ambiguous (two Sams), the agent must **not** write — Pocket speaker ambiguity for the User's own label is handled upstream in import; ambiguity between Contacts remains a prompt-level conservative rule.

## Service role path

Pocket import closes the Chat and invokes `extract-context` with the service role key + `ownerId` (see `pocketImport.ts`). Extraction writes go through **`extraction_create_interaction`** / **`extraction_create_open_thread`** SECURITY DEFINER RPCs that accept `p_owner_id`, so writes succeed without a User JWT while still enforcing owner/chat consistency.

## Idempotency

Unchanged from ADR-0009: `chats.extracted_at` gates re-runs. A second invocation returns `{ skipped: true }`. Empty transcripts are stamped without calling the model.

## Considered options

- **Keep SS/TI-only extraction (ADR-0009).** Rejected — Relationship facts spoken in Chats never reached timelines; Ambient had to re-propose what the User already said.
- **Propose-then-confirm extraction writes.** Rejected for v1 — adds friction on the capture path the product optimises for (in-pocket, immediately after conversation).
- **Let Conversational Intelligence write inline.** Rejected — mixed read/write breaks the Chat trust model; extraction stays post-close with a dedicated prompt and tool surface.
- **Separate tables per context family.** Rejected — Notes, Interactions, and Comms already share `interactions`; Commitments already share `open_threads`. Provenance columns extend existing tables.

## Consequences

- **Extraction Pass glossary entry** in `src/shared/CONTEXT.md` is rewritten — relationship context writer, not User Context summariser.
- **ADR-0009 Extraction bullets** are superseded by this ADR for write surface and downstream consumption; Conversational read-only + Chat lifecycle bullets remain.
- **Migration `20260532000001_extraction_provenance.sql`** — `capture_source`, `source_chat_id` on `interactions` and `open_threads`; extraction RPCs.
- **`extract-context` rewrite** — relationship directory preload, four write tools, provenance stamped on every insert.
- **`Interaction` / `OpenThread` shared types** gain provenance fields; Relationship timeline UI shows source badges.
- **`ChatsClient.extract()` response shape** changes — counts per context family instead of SS/TI flags.
- **Ambient Passes** read extracted rows through existing `RelationshipContextBuilder` / timeline queries — no separate sync step.
- **Triggered Passes** fire on new Interactions / Open Threads via existing DB triggers — extraction benefits automatically.
