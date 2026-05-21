# Instructions for Cursor — Related repo

This file briefs Cursor on the Related codebase and asks you (Cursor) to install Matt Pocock's coding skills so you can collaborate using the same conventions as Claude Code.

> **Rename if you want:** Cursor auto-loads `AGENTS.md` at the repo root. If you'd like Cursor to always have this loaded without you pasting it each time, rename this file to `AGENTS.md`. Otherwise leave it as `instructions.md` and paste it into the Cursor chat at the start of each session.

---

## 1. What this project is

**Related** is a multi-tenant relationship-intelligence app. Each User has Relationships (with Contacts or Groups). An ambient AI agent ("Ambient Intelligence") runs continuously against each Relationship and surfaces structured **Candidate Actions** the User can accept, edit, or decline — the agent never auto-executes.

It's a **multi-context monorepo** with npm workspaces. The four contexts are:

| Context | Path           | Role                                                                |
| ------- | -------------- | ------------------------------------------------------------------- |
| Mobile  | `src/mobile/`  | Expo / React Native app, iOS-primary. Ambient/in-the-moment surface (HealthKit, voice, push, full CRUD). |
| Web     | `src/web/`     | Next.js 15 App Router. Reflective/configuration surface (Sign-in, Connect Calendar, User Context editor, Voice agent). Desktop IA — sidebar + single-column main, Tailwind v4. |
| Backend | `src/backend/` | Supabase (Postgres + Auth + Edge Functions + pg_cron). 21 migrations, 5 Edge Functions. |
| Shared  | `src/shared/`  | Framework-agnostic domain layer — clients, services, types. Both apps consume it. |

**Read these before touching anything substantial:**

- [CLAUDE.md](CLAUDE.md) — top-level project conventions
- [CONTEXT-MAP.md](CONTEXT-MAP.md) — pointer to each context's glossary + ADR folder
- [docs/adr/](docs/adr/) — system-wide architectural decisions (7 ADRs)
- [src/shared/CONTEXT.md](src/shared/CONTEXT.md) — the cross-cutting domain glossary. **Use these terms exactly when you name concepts** (User, Relationship, Contact, Group, Open Thread, Candidate Action, Agent Pass, User Context, Ambient Intelligence). Don't drift to synonyms the glossary explicitly avoids.
- [docs/DEPLOY.md](docs/DEPLOY.md) — tiered deploy story (Tier 0–4)
- [docs/agents/](docs/agents/) — agent conventions (issue tracker, triage labels, domain doc usage)

Context-specific glossaries are at `src/<context>/CONTEXT.md`. Most are stubs — that's expected; they get filled in lazily via `grill-with-docs` (see §3).

---

## 2. Current state — as of 2026-05-20

**Latest on `main` (`2e6016f`)**: PR #46 just merged — the frontend was split into `src/mobile/` (Expo, renamed from `src/frontend/`) and a new `src/web/` Next.js workspace. The `@related/shared` library is consumed by both. See [ADR-0007](docs/adr/0007-split-web-mobile-frontends.md) for the rationale and [ADR-0005](docs/adr/0005-platform-stack.md) for the amended platform decision.

**What works:**

- Web routes built and passing build: `/` (redirect), `/sign-in`, `/sign-up`, `/auth/sign-out`, `/onboarding`, `/context`, `/talk`
- Mobile jest unit tests: 90/90 pass
- Backend RLS tests: 66/66 pass
- Shared library tests: 191/192 pass (1 live-API test requires `ANTHROPIC_API_KEY` — opt-in, not a regression)

**Known broken / open:**

1. **Vercel deploy is still serving the OLD Expo web bundle** at https://related-sooty.vercel.app. The repo's `vercel.json` now points at the Next.js build, but the Vercel dashboard's Build Command / Framework settings have explicit overrides (set when the project was first imported) that take precedence. Fix is dashboard-side, not code-side. See [docs/DEPLOY.md](docs/DEPLOY.md) Tier 0.3 for the canonical configuration; also add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars in Vercel (the Expo `EXPO_PUBLIC_*` keys won't be exposed to the Next.js browser bundle).

2. **`@related/shared` type drift the web app worked around** — worth tightening up in a focused follow-up PR (do not bundle with feature work):
   - `AuthClient.onAuthStateChange` doesn't surface `provider_token` on the callback Session shape — the `/onboarding` route re-probes via `getSessionWithProviderTokens()` after every auth event. Could expose an `onAuthStateChangeWithProviderTokens` variant.
   - `UserContextClient.updateGoal` returns `void` — the `/context` editor has to fabricate `updatedAt` locally. Could return the updated row.
   - `runEngagedTurn` returns `EngineCandidateSet` (actions are `CandidateActionInput[]` — no `id`, no `decisionState`), which collides with the richer `CandidateSet` re-exported from `@related/shared`'s `index.ts`. The `/talk` route has a local adapter to bridge the two shapes.
   - `SessionHandle.onUserTurn` returns `{ text, candidateSet }` where `text` is the agent's spoken gist — the user's STT transcript isn't surfaced, so `/talk` shows the user bubble as a placeholder.
   - `RelationshipsClient.listRelationships()` (not `.list()`) — minor naming drift in the surface.

3. **iOS native build (Tier 4)** is unfinished — needs a Mac with Xcode and an Apple Developer account. See [src/mobile/modules/healthkit/README.md](src/mobile/modules/healthkit/README.md) for the HealthKit native build steps.

**Repo guardrails (from [CLAUDE.md](CLAUDE.md)):**

- Issue tracker is **GitHub Issues** at [lucanardinocchi/Related](https://github.com/lucanardinocchi/Related) via the `gh` CLI. See [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).
- Triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See [docs/agents/triage-labels.md](docs/agents/triage-labels.md).
- When working in a context, read its `CONTEXT.md` glossary and its `docs/adr/` folder. If a term you need isn't in the glossary, that's a signal — either reconsider the term, or note it for `grill-with-docs` to add.

---

## 3. Install Matt Pocock's coding skills

The Related repo already follows Matt Pocock's conventions ([github.com/mattpocock/skills](https://github.com/mattpocock/skills)) — the `docs/agents/` files, the canonical triage labels, the lazy `CONTEXT.md` / ADR pattern, the tracer-bullet vertical-slice ticketing — but the skills themselves aren't installed for Cursor yet. Install them now.

Cursor doesn't have Claude Code's `SKILL.md` machinery, so we convert each skill into a Cursor rule under `.cursor/rules/`. Cursor's `.mdc` format uses YAML frontmatter (`description`, optionally `globs` and `alwaysApply`) followed by markdown.

### Steps

1. **Clone Matt Pocock's repo** into a temporary location (not into this repo's tree — we only want the content):

   ```sh
   git clone https://github.com/mattpocock/skills /tmp/mattpocock-skills
   ```

2. **Create the Cursor rules directory** if it doesn't exist:

   ```sh
   mkdir -p .cursor/rules
   ```

3. **For each skill listed below**, find its directory under `/tmp/mattpocock-skills/` (typically `engineering/<skill>/SKILL.md`, `productivity/<skill>/SKILL.md`, etc.) and create a corresponding `.cursor/rules/<skill>.mdc` file with this shape:

   ```mdc
   ---
   description: <one-line description from the skill's YAML frontmatter or my list below>
   alwaysApply: false
   ---

   <full markdown body of SKILL.md, minus its own frontmatter>

   <if the skill bundles other files (scripts, examples), inline the most important ones or paste links to /tmp/mattpocock-skills/<skill>/<file>>
   ```

   - Use `alwaysApply: false` for **all** the skills below. They're playbooks the user explicitly invokes, not background rules.
   - Skip the `globs` field — these skills are file-agnostic.
   - Preserve cross-references inside the skill body (some skills reference `docs/agents/issue-tracker.md` etc. — those files already exist in this repo, so the references resolve).

4. **Verify** each `.cursor/rules/<skill>.mdc` shows up in Cursor's rules panel (Cursor → Settings → Rules), and that the description matches the skill's actual purpose so Cursor will surface it when the user's intent matches.

### Skills to install

**Engineering** (must-have for code work):

- `diagnose` — structured debugging loop for hard bugs / perf regressions. Invoke when chasing a real bug.
- `grill-with-docs` — planning interview that stress-tests a design against the project's domain language and updates `CONTEXT.md` / ADRs inline as decisions land. Invoke before starting a significant slice.
- `triage` — state-machine triage of issues using the labels in [docs/agents/triage-labels.md](docs/agents/triage-labels.md). Invoke when triaging incoming bugs / feature requests.
- `improve-codebase-architecture` — finds simplification / consolidation opportunities, informed by the domain glossary and ADRs.
- `tdd` — red/green/refactor TDD loop. Invoke when building features or fixing bugs test-first.
- `to-issues` — converts a plan or PRD into independently-grabbable GitHub issues as tracer-bullet vertical slices.
- `to-prd` — synthesises the current conversation into a PRD published as a GitHub issue.
- `zoom-out` — broader-context summary when you need architectural perspective on an unfamiliar area.
- `prototype` — builds a throwaway prototype (terminal app for state/logic, or multiple toggleable UI variants) to validate a design before committing.
- `setup-matt-pocock-skills` — per-repo configuration helper. Largely already done here ([docs/agents/](docs/agents/) exists, triage labels are defined, issue tracker is GitHub) — read it for completeness but you'll mostly be confirming existing state.

**Productivity** (optional but useful):

- `caveman` — ~75% token reduction for terse work modes.
- `grill-me` — intensive questioning until all decision branches are explored. Good for planning non-code work.
- `handoff` — compacts the current conversation into a handoff doc for another agent / session.
- `write-a-skill` — meta-skill for creating new skills.

**Miscellaneous** (install only if relevant):

- `git-guardrails-claude-code` — **skip**. Claude-Code-specific hooks; not applicable to Cursor.
- `migrate-to-shoehorn` — install only when you're modernising TypeScript test patterns.
- `scaffold-exercises` — skip unless you start building educational content.
- `setup-pre-commit` — install if/when this repo adds Husky pre-commit hooks (it currently doesn't).

### What to do AFTER installing

Apply the **`setup-matt-pocock-skills`** skill once to confirm this repo's configuration matches what the other skills expect. Most of it is already in place ([docs/agents/issue-tracker.md](docs/agents/issue-tracker.md), [docs/agents/triage-labels.md](docs/agents/triage-labels.md), [docs/agents/domain.md](docs/agents/domain.md), per-context `CONTEXT.md` files, ADR folders) — but verify and fix any gaps.

---

## 4. How to use the skills (mapping to this project)

- "I want to add feature X" → `grill-with-docs` to nail the design + glossary → `to-issues` to slice it into vertical PRs → `tdd` per slice.
- "There's a bug" → `diagnose`.
- "This module is getting tangled" → `improve-codebase-architecture`.
- "Help me draft a PRD" → `to-prd`.
- "I'm not sure how this part of the codebase fits together" → `zoom-out`.
- "Let me play with the design first" → `prototype`.

When a skill mentions a triage role (e.g. "apply the AFK-ready label"), use the canonical label name from [docs/agents/triage-labels.md](docs/agents/triage-labels.md): `ready-for-agent`. When a skill says "publish to the issue tracker", create a GitHub issue via `gh`.

---

## 5. Hard rules for this repo

These apply to **every** session, regardless of which skill is active.

- **Use the glossary's vocabulary.** When naming a concept (issue title, refactor proposal, test name, comment), use the exact term from [src/shared/CONTEXT.md](src/shared/CONTEXT.md) — User, Relationship, Contact, Group, Interaction, Open Thread, Candidate Action, Agent Pass, User Context (and its four flavours: Transient Intent, Situational State, Goals & Values, Inferred Signals), Salience, Ambient Intelligence. Avoid the synonyms each entry explicitly rules out.
- **Flag ADR conflicts explicitly.** If your output contradicts an existing ADR, surface it rather than silently overriding. Example: "Contradicts ADR-0007 (split web/mobile frontends) — but worth reopening because…"
- **`@related/shared` is the integration boundary.** Anything that touches Supabase, Anthropic, OpenAI, or ElevenLabs belongs in `src/shared/`, not in `src/mobile/` or `src/web/`. New domain logic added in only one app should be flagged for moving to shared.
- **Don't add features beyond the task.** A bug fix doesn't need surrounding cleanup; a one-shot operation doesn't need a helper. Three similar lines is better than a premature abstraction.
- **Don't add comments that explain WHAT the code does** — names already do that. Only add a comment when the WHY is non-obvious (a hidden constraint, a subtle invariant, a workaround for a specific bug).
- **Multi-tenant safety ([ADR-0006](docs/adr/0006-multi-tenant-architecture.md))**: every table has an `owner_id` column and RLS gates `owner_id = auth.uid()`. Never write a query or migration that bypasses this. Edge Functions iterating across tenants must use the service-role key explicitly and intentionally.
- **Web env var convention**: web uses `NEXT_PUBLIC_*` (required by Next.js for browser exposure); mobile uses `EXPO_PUBLIC_*`. Both prefixes point at the same Supabase project. Don't unify them.
- **Tests:** mobile uses jest (run from `src/mobile/`). Shared uses jest (`src/shared/`). Backend uses jest for RLS tests against a real local Supabase. Web has no tests yet — when you add them, pick one of: vitest + playwright (recommended for App Router), or jest. Don't bolt on react-testing-library/react-native-testing-library inheritance from mobile — web is a fresh stack.
- **Vercel deploy** still needs dashboard-side updates to actually switch to Next.js (see §2 item 1). Until those are applied, https://related-sooty.vercel.app will keep serving the old Expo bundle even after merges to `main`.

---

## 6. Things to NOT do

- Do **not** force-push to `main` or rewrite published history.
- Do **not** skip git hooks (`--no-verify`) or bypass signing without an explicit user request.
- Do **not** commit `.env`, `.env.local`, or any other secret-bearing file. `.env.example` files are fine.
- Do **not** add Tailwind / Next.js plugins or new npm dependencies without checking with the user — keep the surface area small.
- Do **not** modify ADRs casually. ADRs are decisions; amend the way [ADR-0006](docs/adr/0006-multi-tenant-architecture.md) and [ADR-0007](docs/adr/0007-split-web-mobile-frontends.md) amend earlier ones, with a clear supersession note.
- Do **not** add cross-app feature drift to `src/web/` beyond its agreed scope (Sign-in/up, Connect Calendar, User Context editor, Voice agent). Mobile owns the broader CRUD surface in v1 per ADR-0007.
- Do **not** call private/internal helpers from `src/shared/` — only the exports listed in `src/shared/src/index.ts` are public API for the two apps.

---

## 7. First-session checklist for Cursor

When you (Cursor) start a fresh session on this repo, do this once:

1. Read [CLAUDE.md](CLAUDE.md), [CONTEXT-MAP.md](CONTEXT-MAP.md), and [src/shared/CONTEXT.md](src/shared/CONTEXT.md) end-to-end.
2. Skim [docs/adr/0001-three-tier-agent-pass.md](docs/adr/0001-three-tier-agent-pass.md) through [docs/adr/0007-split-web-mobile-frontends.md](docs/adr/0007-split-web-mobile-frontends.md). You don't need to memorise them, but know they exist and roughly what each decides.
3. Run `git log --oneline -10` to see the latest work.
4. Run `gh issue list --state open --limit 20` to see open work.
5. If `.cursor/rules/` doesn't yet contain Matt Pocock's skills, do §3 now.
6. Confirm understanding by summarising back: the four contexts, the latest commit, and any open issues you've seen — in two or three sentences. Then ask the user what they'd like to work on.
