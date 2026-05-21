# infer-values-from-alignments

Read-only AI inference for Values Discovery. Proposes first-person Goals & Values from the User's align/reject swipes on media characters. **Does not write to the database** — the User confirms proposals in the UI before they are added to Context via `userContext.addGoal`.

## Deploy

```sh
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy infer-values-from-alignments
```

## Request

POST. `Authorization: Bearer <user_jwt>`. Body:

```json
{
  "aligned": [
    {
      "characterId": "ted-lasso",
      "name": "Ted Lasso",
      "source": "Ted Lasso",
      "values": ["Kindness", "Curiosity", "Belief", "Teamwork"]
    }
  ],
  "rejected": [
    {
      "characterId": "walter-white",
      "name": "Walter White",
      "source": "Breaking Bad",
      "values": ["Security", "Recognition", "Control", "Family"]
    }
  ]
}
```

Requires at least 10 reviewed characters total (`aligned.length + rejected.length >= 10`).

## Response

```json
{
  "proposedGoals": [
    "Lead with kindness even when the stakes are high",
    "Stay curious about people instead of judging them quickly"
  ]
}
```

Returns 3–5 first-person goal/value statements.

## Failure modes

- Missing or invalid auth → 401
- Fewer than 10 reviewed characters → 400
- Anthropic / parse errors → 502
