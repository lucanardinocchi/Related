# Relationship.target is polymorphic (Contact or Group); Group-mode is explicit

A **Relationship** has a polymorphic target — pointing at either a single **Contact** or a single **Group** — rather than two distinct entity types. The Relationship shape (Open Threads, Candidate Set, Interaction history, agent loop, three-tier Pass treatment) is uniform across both targets. The UI surfaces them on separate pages despite the shared entity type.

The load-bearing corollary: when an Interaction is logged in **Group mode**, it touches the Group Relationship **and** each member Contact's individual Relationship — one logged Interaction updates multiple layers. Group-mode is set **explicitly** at capture time (e.g., the User said "group dinner with college friends"), never inferred from member overlap. A 1:1 coffee with Sam, who happens to belong to a Group, does **not** update the Group Relationship.

## Considered options

- **Two distinct entity types** (IndividualRelationship and GroupRelationship). Rejected: doubles the rendering paths, the agent prompt variants, and the schema surface for no real semantic gain — the shape of "the bond from User to other-end" is the same regardless of whether the other end is one person or a collection.
- **Group as a tag or filter** over individual Relationships. Rejected: a Group has properties an individual doesn't (group dynamics, group-only Open Threads, group-only Interaction history) and deserves to be a first-class entity the agent can run Passes against.
- **Infer Group-mode from member overlap** in an Interaction's Contacts. Rejected: would pollute Group state from 1:1 hangouts and make it impossible to tell whether the group has actually drifted as a group.

## Why

Keeping the Relationship entity uniform makes the agent loop, UI rendering, and calendar filter single-implementation. Making Group a first-class target (not a tag) gives the agent its own thing to reason about for group dynamics. Making Group-mode explicit at capture time preserves the integrity of group state versus individual state — without this, the agent can't tell whether you've actually seen the group lately or whether you've just seen members one-by-one.
