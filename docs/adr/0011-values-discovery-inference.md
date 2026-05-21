# Values Discovery: AI-proposed Goals & Values with User confirmation

**Extends [ADR-0009](0009-three-agent-architecture.md).** ADR-0009 rejected Extraction Pass writes to Goals & Values on the grounds that G&V is *"long-running, User-authored … Not inferred."* This ADR documents the **sole exception**: the **Values Discovery** onboarding flow, where AI proposes first-person goal statements from the User's character-alignment swipes, but **nothing is written to Goals & Values until the User confirms** in the UI.

## Flow

Values Discovery is a web-primary guided flow (`/values`, `/values/rank`) that helps a new User seed their **Goals & Values** flavour of **User Context** without free-form authoring from a blank page.

1. **Swipe alignments** — the User reviews media characters (seed roster plus adaptively suggested characters) and swipes right (align) or left (reject). Each decision is persisted as a `character_values_alignment` row via `ValuesAlignmentClient`. `suggest-values-characters` Edge Function refills the queue from the User's swipe history; it proposes new characters only — it does not write Goals & Values.
2. **Rank** — once the User has aligned with at least `MIN_ALIGNED_FOR_RANKING` (10) characters, they can drag-rank their aligned set. Rank order is persisted via `ValuesAlignmentClient.saveRankings`.
3. **Infer** — on the rank view, `_ValuesConfirmPanel` invokes `infer-values-from-alignments` Edge Function with aligned and rejected character payloads (including each character's declared value tags). The function returns 3–5 first-person goal/value statement **proposals** only.
4. **Confirm** — the User edits, deselects, or regenerates proposals, then explicitly clicks **Add to Context**. Only then does the client call `userContext.addGoal` for each selected row. Until that click, Goals & Values are unchanged.

```
Swipe (/values) → Rank (/values/rank) → Infer (Edge Function, read-only)
                                              ↓
                                    Confirm (_ValuesConfirmPanel)
                                              ↓
                              userContext.addGoal (User-initiated write)
```

## Exception to "never inferred"

`src/shared/CONTEXT.md` states Goals & Values are User-authored and not inferred. Values Discovery is the **only** path where AI generates candidate G&V text. The invariant preserved from ADR-0009 is **User authorship at write time**, not "the User must type every word from scratch":

- **AI proposes** — inference runs only after sufficient swipe signal (≥10 reviewed characters total for inference; ≥10 alignments to unlock the confirm panel).
- **User must confirm** — proposals are editable checkboxes; deselected rows are discarded; **Add to Context** is an explicit User action.
- **No agent auto-write** — neither Ambient Intelligence, Conversational Intelligence, nor Extraction Pass writes Goals & Values. Values Discovery is a dedicated UI flow, not an Agent Pass side effect.

This is structurally parallel to **Candidate Actions** (agent proposes → User picks) but scoped to onboarding G&V seeding and implemented outside the Pass loop.

## Edge Functions are read-only until confirm

Both Values Discovery Edge Functions are **read-only with respect to Goals & Values** (and with respect to alignment rows beyond what the client already persisted):

| Function | Purpose | Writes to DB |
|----------|---------|--------------|
| `suggest-values-characters` | Propose 6–8 new characters for the swipe queue | No G&V; returns character drafts only |
| `infer-values-from-alignments` | Propose first-person goal statements from align/reject sets | No G&V; returns `proposedGoals` array only |

Alignment and ranking persistence is client-driven through `ValuesAlignmentClient` (Supabase table CRUD). Inference functions never call `userContext.addGoal` or touch the goals table directly.

## Considered options

- **Let Extraction Pass draft Goals from Chats.** Rejected in ADR-0009 — chat-derived self-narrative belongs in Situational State, not G&V.
- **Auto-add inferred goals after ranking.** Rejected — violates User-authored G&V trust; the User must see and edit proposals first.
- **Fully manual G&V onboarding only.** Rejected for empty-state UX — Values Discovery gives signal from concrete character comparisons while keeping the confirm gate.

## Consequences

- **New domain term** in `src/shared/CONTEXT.md`: **Values Discovery**.
- **Goals & Values** glossary wording remains "User-authored"; the exception is documented in ADR-0011 and the Values Discovery entry, not by weakening the general rule.
- **Implementation anchors**: `ValuesAlignmentClient`, web routes under `app/(authed)/values/`, `_ValuesConfirmPanel.tsx` (confirm gate), Edge Functions `suggest-values-characters` and `infer-values-from-alignments`.
- **Mobile** is out of scope for Values Discovery in v1 (web-primary onboarding surface, consistent with ADR-0008).
