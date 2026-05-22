# ambient-pass

Edge Function that wraps the Sonnet 4.6 call for Ambient Intelligence (baseline and
triggered Agent Passes). Keeps the `ANTHROPIC_API_KEY` server-side — the client
(Expo / web / server-side pass workers) calls this function via
`supabase.functions.invoke('ambient-pass', { body: { prompt } })` and receives
`{ actions: CandidateActionInput[] }`.

## Deploy

```sh
# One-time:
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# Each release:
supabase functions deploy ambient-pass
```

## Migration from `engaged-pass`

Supabase Edge Functions have no built-in alias: the deploy slug is the folder
name. This function was formerly `engaged-pass` (Engaged Pass tier, now retired
from scheduling). After deploying `ambient-pass`, remove the old
`engaged-pass` deployment from the project (Dashboard → Edge Functions, or
`supabase functions delete engaged-pass` when available).

During a staged rollout, `EdgeFunctionAgentCaller` accepts
`functionName: 'engaged-pass'` until all environments ship the rename.

## Shared imports (Deno)

Prompt and parser live in `@related/shared`. From this folder:

```ts
import {
  AMBIENT_MODEL,
  SYSTEM_PROMPT,
  buildUserMessage,
  type AmbientAgentPrompt,
} from "../../../../shared/src/agent/ambientAgentCore.ts";
import {
  AMBIENT_TOOLS,
  parseToolUseToActions,
} from "../../../../shared/src/agent/ambientTools.ts";
```

From `supabase/functions/_shared/` use the same `../../../../shared/src/agent/...` prefix.

## Contract

**Request body** — `{ prompt: AgentPrompt }`. The prompt shape is defined by
[`PassEngine.AgentPrompt`](../../../../shared/src/agent/PassEngine.ts).

**Response** — `{ actions: CandidateActionInput[] }`. Same shape as
`ClaudeAgent.propose()` would return in-process, including the
exactly-one-action invariant (length 1; DoNothing when the model emits none).
