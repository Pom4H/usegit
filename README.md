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

accepted compatible work -> integration policy -> direct merge
                                                -> optional PR boundary
```

Git remains the source of truth. Files under `experiments/` hold durable experiment definitions; commit trailers bind code changes to those experiments; `refs/notes/usegit` is an enrichment layer for CI observations rather than another source of truth.

## First experiment: commit granularity

We deliberately compare three policies instead of hard-coding one:

- `coarse`: one whole experiment per commit;
- `fine`: one artifact or narrow implementation step per commit;
- `dynamic`: one falsifiable causal unit per commit, independent of file count.

The current hypothesis is that `dynamic` will preserve intent and revert precision without producing the coordination overhead of tiny commits. It is intentionally provisional.

## Pull requests are not work items

A task, agent, branch or experiment does not automatically deserve a pull request. Work remains in the causal graph until it has accepted evidence and can be grouped into a compatible integration set.

`usegit integration` answers whether that set can be integrated directly or whether a real boundary requires one PR for the entire set. Current explicit boundaries are human review, protected targets, releases and external contributors.

This intentionally targets the common AI-agent failure mode of producing many forgotten PRs whose only purpose was to remember that work existed.

## Usage

```bash
npm test
npm run context
npm run report
npm run next
npm run boundary -- .usegit/plan.json
npm run integration -- .usegit/integration.example.json
```

`context` is meant to be the first command an agent runs after entering a repository. `next` turns accumulated Git history back into the next experiment candidate. `integration` derives PR creation from an integration boundary instead of from task count.

See `AGENTS.md` and `docs/protocol.md` before changing this repository.
