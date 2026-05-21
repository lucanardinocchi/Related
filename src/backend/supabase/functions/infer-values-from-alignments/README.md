# infer-values-from-alignments

Read-only AI inference for Values Discovery. Proposes a **common value set**, **personality & attitude**, and first-person **goal statements** from the User's **top 5 ranked** character alignments. **Does not write to the database** — the User confirms proposals in the UI before they are added to Context via `userContext.addGoal`.

## Deploy

```sh
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy infer-values-from-alignments
```

## Request

POST. `Authorization: Bearer <user_jwt>`. Body:

```json
{
  "rankedTop": [
    {
      "characterId": "ted-lasso",
      "name": "Ted Lasso",
      "source": "Ted Lasso",
      "values": ["Kindness", "Curiosity", "Belief", "Teamwork"],
      "rank": 1
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

Requires at least 5 ranked characters in `rankedTop`.

## Response

```json
{
  "proposedValueSet": ["Kindness", "Belief", "Teamwork", "Curiosity"],
  "proposedAttitude": "You lead with warmth and genuine curiosity about people, staying optimistic even when things get hard.",
  "proposedGoals": [
    "Lead with kindness even when the stakes are high",
    "Stay curious about people instead of judging them quickly"
  ]
}
```

## Failure modes

- Missing or invalid auth → 401
- Fewer than 5 ranked characters → 400
- Anthropic / parse errors → 502
