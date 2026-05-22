# @related/evals

Offline eval harness for the Conversational Intelligence agent. Runs scripted cases against fixture worlds (no Supabase) and writes full traces for human review.

## Setup

From the repo root:

```bash
npm install
```

For live agent runs, set your Anthropic API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Run evals

From the repo root:

```bash
npm run eval -- --list
npm run eval -- --all
npm run eval -- --case sam-ambiguous
```

Or from `src/evals/`:

```bash
npm run eval -- --all
```

Output defaults to `src/evals/runs/<ISO-timestamp>/`:

- `<caseId>.trace.json` — full agent trace (prompt, context, rounds, tool results)
- `manifest.json` — run metadata and case index
- `runs/index.json` — updated so the viewer can list all runs

Override output directory:

```bash
npm run eval -- --all --out /tmp/my-run
```

### Sample traces (no API key)

Smoke-test the viewer without calling Anthropic:

```bash
npm run eval -- --sample
```

## View traces

```bash
npm run eval:view
```

Open http://localhost:4173/viewer/ — pick a run from the dropdown (requires `runs/index.json` from a prior eval run).

You can also load a run folder or `manifest.json` via the file picker when working offline.

## Layout

| Path | Purpose |
|------|---------|
| `cases/*.yaml` | Eval cases (history, world reference, tags) |
| `fixtures/worlds/*.json` | Snapshot + tool fixture data |
| `src/runtime/` | Agent runtime (prompt, tools, `runConversationalAgentTurn`) |
| `src/runner/cli.ts` | CLI entrypoint |
| `viewer/` | Static local trace viewer |
| `runs/` (gitignored) | Eval run output |

## Adding a case

1. Add a world fixture under `fixtures/worlds/`.
2. Add a YAML case under `cases/` referencing that world file.
3. Run with `--case <id>` or `--all`.

Human review only — no automated LLM graders. Use `notes` in the case YAML and Pass/Fail/Skip in the viewer (saved to browser localStorage).
