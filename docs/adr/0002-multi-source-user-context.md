# Multi-source, dynamically-weighted User Context

The agent reasons over a **User Context** composed of five distinct, separately-stored flavours — dynamically weighted at Agent Pass time rather than flattened into a single profile or preferences record:

- **Transient Intent** — ephemeral, captured in voice sessions with the agent.
- **Situational State** — medium-term, evolves over weeks/months. Reflects where the User is in life. Updated explicitly by the User and silently by the agent when surfaced in conversation.
- **Goals & Values** — long-running, User-authored. Edited explicitly when the User decides to add or change one. Not inferred.
- **Operator Profile** — long-running, User-authored. The User's declared Strengths (what they're positioned to offer). Used as a capability filter on every Pass: a Candidate Action must route through one of these Strengths or the agent falls back to DoNothing. Not inferred — the agent reads but never writes this flavour.
- **Inferred Signals** — system-observed (v1: Calendar density + Sleep).

Each lives in its own table with its own lifecycle and write pattern. None is permanently dominant — their relative influence on agent reasoning is determined per Pass by their current **Salience** (e.g., a recent dramatic life change in Situational State outweighs a long-steady Goal).

## Considered options

- **Single User Context "document"** (one record per User with all five flavours flattened). Rejected: collapses the distinct write patterns (Goals & Values and Operator Profile are User-authored, Inferred Signals are system-observed, Transient Intent is ephemeral) and forces uniform salience treatment that doesn't match reality.
- **Static weights per flavour.** Rejected: real life is non-stationary — what matters today is not what mattered last month. Fixed weights would make the agent insensitive to the User's actual current state.
- **Deferring Inferred Signals to v2** to start simpler. Rejected: the ambient intelligence value proposition depends on the agent reasoning over the User's actual state, not just stated intent. Inferred Signals must be in from v1.

## Why

The five sources have genuinely different update cadences, ownership models, and decay profiles. Combining them into one record obscures those differences and makes salience-aware reasoning awkward. Storing them separately and weighting per Pass keeps each model honest.

Operator Profile was added after the original four when it became clear the agent was emitting Candidate Actions in domains the User had no capability to deliver on (the classic "propose a carpentry favour to someone with no carpentry skills" failure mode). Making capability fit a first-class input — rather than something the User has to keep declining out of — keeps proposed help honest. It lives separately from Goals & Values because it answers a different question: Goals describe what the User wants their relational life to look like; Operator Profile describes what the User is positioned to offer back.
