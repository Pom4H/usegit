# usegit

`usegit` is an experiment in treating Git as the design-time memory of AI-native software development.

The repository dogfoods itself. Every meaningful change carries machine-readable causal metadata, CI materializes evidence into Git notes, and the CLI reads the history back to answer: what was tried, why, what happened, and what should be tested next.

## Model

```text
intent -> hypothesis -> experiment -> change -> evidence -> decision
                           |            |
                           |            +-> Git commit + trailers
                           +----------------> experiment record

CI evidence -------------------------------> refs/notes/usegit
```

Git remains the source of truth. Files under `experiments/` hold durable experiment definitions; commit trailers bind code changes to those experiments; `refs/notes/usegit` is an enrichment layer for CI observations rather than another source of truth.

## First experiment: commit granularity

We deliberately compare three policies instead of hard-coding one:

- `coarse`: one whole experiment per commit;
- `fine`: one artifact or narrow implementation step per commit;
- `dynamic`: one falsifiable causal unit per commit, independent of file count.

The current hypothesis is that `dynamic` will preserve intent and revert precision without producing the coordination overhead of tiny commits. It is intentionally provisional.

## Usage

```bash
npm test
npm run context
npm run report
npm run next
npm run boundary -- .usegit/plan.json
```

`context` is meant to be the first command an agent runs after entering a repository. `next` turns accumulated Git history back into the next experiment candidate.

See `AGENTS.md` and `docs/protocol.md` before changing this repository.
