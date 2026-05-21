# suggest-values-characters

Adaptive Values Discovery — proposes 6–8 new media characters similar to the User's right-swipes.

```sh
cd src/backend
supabase secrets set ANTHROPIC_API_KEY=sk-ant-…
supabase functions deploy suggest-values-characters
```

**Body:** `{ aligned, rejected, excludeIds }` — same character shape as infer-values-from-alignments.

**Response:** `{ characters: [{ id, name, source, values }] }`
