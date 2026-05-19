# engaged-pass

Edge Function that wraps the Sonnet 4.6 call for the Engaged Pass. Keeps the
`ANTHROPIC_API_KEY` server-side — the client (Expo / web) calls this function
via `supabase.functions.invoke('engaged-pass', { body: { prompt } })` and
receives `{ actions: CandidateActionInput[] }`.

## Deploy

```sh
# One-time:
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# Each release:
supabase functions deploy engaged-pass
```

## Contract

**Request body** — `{ prompt: AgentPrompt }`. The prompt shape is defined by
[`PassEngine.AgentPrompt`](../../../../shared/src/agent/PassEngine.ts).

**Response** — `{ actions: CandidateActionInput[] }`. Same shape as
`ClaudeAgent.propose()` would return in-process, including the
DoNothing-always invariant.

## Why duplicated tool schema

The function inlines the same tool schema + tool-name mapping as
[`ClaudeAgent`](../../../../shared/src/agent/ClaudeAgent.ts) rather than
importing it. Deno's NPM specifiers can pull external packages, but
importing a sibling workspace package across the `backend/` boundary is
awkward. The tradeoff: small duplication for a self-contained deploy unit.
If the tool schema changes in `ClaudeAgent.ts`, mirror the change here.
