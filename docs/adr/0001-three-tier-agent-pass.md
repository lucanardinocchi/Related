# Three-tier Agent Pass model with per-tier cadence and model class

Ambient Intelligence — the always-on agent reasoning over each Relationship — runs as three distinct **Agent Pass** tiers rather than a single unified loop. Each tier is triggered differently, runs on a different model class, and serves a different purpose:

- **Baseline Pass** — scheduled every 6 hours per Relationship, uniformly across all Relationships. Haiku-class. Keeps Candidate Sets fresh in the background.
- **Triggered Pass** — runs whenever new context affects a Relationship (a logged Interaction, a Goal/Value edit, an Inferred Signal shift, an approaching planned Interaction). Haiku-class. Acts on the affected Relationship(s) only.
- **Engaged Pass** — runs synchronously when the User starts a voice session focused on a Relationship. Inputs include live **Transient Intent**. Sonnet-class.

## Considered options

- **Single unified Pass type** triggered on any of these conditions. Rejected: would force one model class for all use cases — either Sonnet everywhere (cost-prohibitive at every-6-hours × N Relationships per User) or Haiku everywhere (Engaged Pass quality drops below acceptable for live conversation).
- **Tiered by Relationship importance** rather than by trigger type (e.g., close relationships every hour, acquaintances weekly). Rejected: bakes in a heuristic instead of letting the agent decide, and introduces a "Relationship importance" concept we deliberately avoided.

## Why

The three triggers have genuinely different latency, cost, and quality requirements. Baseline is volume-heavy and must be cheap. Triggered is reactive and bursty. Engaged is rare, high-value, with a human waiting. One model class can't serve all three economically.
