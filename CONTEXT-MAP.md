# CONTEXT-MAP

Related is a multi-context monorepo. Each context has its own `CONTEXT.md` glossary and ADR folder. Read whichever ones touch the area you're working in.

| Context  | Path              | Glossary                       | ADRs                              |
| -------- | ----------------- | ------------------------------ | --------------------------------- |
| Frontend | `src/frontend/`   | `src/frontend/CONTEXT.md`      | `src/frontend/docs/adr/`          |
| Backend  | `src/backend/`    | `src/backend/CONTEXT.md`       | `src/backend/docs/adr/`           |
| Mobile   | `src/mobile/`     | `src/mobile/CONTEXT.md`        | `src/mobile/docs/adr/`            |
| Shared   | `src/shared/`     | `src/shared/CONTEXT.md`        | `src/shared/docs/adr/`            |

System-wide decisions live in `docs/adr/` at the repo root.

These files are filled in lazily by `/grill-with-docs` as terms and decisions actually get resolved. An empty `CONTEXT.md` is fine; don't pre-populate it.
