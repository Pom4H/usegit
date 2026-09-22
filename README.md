# usegit

`usegit` is an experiment in treating Git as the design-time memory and durable execution state of AI-native software development.

The repository dogfoods itself. Meaningful changes carry machine-readable causal metadata, CI materializes evidence into Git notes, live work is persisted under Git refs, and the CLI reconstructs what was tried, what is still running, what is awaiting external evidence, and what should happen next.

## Adopt it in an existing repository

No language, framework or package-manager migration is required.

```bash
npx --yes github:Pom4H/usegit#main init
git add .usegit AGENTS.md experiments/README.md .github/workflows/usegit-causal.yml
git commit -m "chore: adopt usegit"
```

That commit is the **bootstrap boundary**. Existing history stays untouched. Starting with the following non-merge commit, CI requires the causal trailers.

`init` is idempotent and intentionally narrow. It preserves repository-specific `AGENTS.md` content outside a managed marker block, configures Git notes rewrite behavior, adds commit-boundary and integration examples, and installs a small caller workflow for the reusable usegit CI.

The generated agent protocol also enables the durable `WORK-*` lifecycle already built into usegit: agents inspect existing work before starting, claim leases, persist continuations before waiting, and can resume from Git without relying on chat history.

The target project does not need to add usegit as a dependency:

```bash
npx --yes github:Pom4H/usegit#main context
npx --yes github:Pom4H/usegit#main start --goal "..." --hypothesis "..." --experiment EXP-0001
npx --yes github:Pom4H/usegit#main await WORK-... --event ci:test
npx --yes github:Pom4H/usegit#main resume WORK-... --result success --evidence "..."
npx --yes github:Pom4H/usegit#main next
npx --yes github:Pom4H/usegit#main boundary -- .usegit/plan.json
npx --yes github:Pom4H/usegit#main integration -- .usegit/integration.json
```

## Model

```text
intent -> hypothesis -> WORK -> change -> evidence -> decision
                         |        |
                         |        +-> Git commit + trailers
                         +----------> refs/usegit/work/*

CI evidence -------------------------------> refs/notes/usegit

accepted compatible work -> integration policy -> direct merge
                                                -> optional PR boundary
```

Git remains the source of truth. Files under `experiments/` hold durable experiment definitions; commit trailers bind code changes to those experiments; `refs/notes/usegit` carries CI observations; `refs/usegit/work/*` carries small live execution states without dirtying the project tree.

## Durable work

A model invocation must not be the owner of process state. It owns only the next decision.

Start a work unit before implementation:

```bash
export USEGIT_AGENT_ID=chatgpt-a

usegit start \
  --goal "reduce reality gap below 0.05" \
  --hypothesis "contact shadows improve similarity" \
  --experiment EXP-0017
```

The returned `WORK-*` ref has an expiring lease. Before waiting on CI or another external event, persist a continuation and release the lease:

```bash
usegit await WORK-1234ABCD \
  --event ci:gpu-render \
  --on-success "combine with material experiment" \
  --on-failure "inspect gpu trace"
```

The invocation can now end. A later agent begins with:

```bash
usegit context
```

and sees the awaiting work. When evidence arrives, a fresh invocation can claim it:

```bash
export USEGIT_AGENT_ID=chatgpt-b

usegit resume WORK-1234ABCD \
  --result success \
  --evidence "reality gap 0.091 -> 0.074"
```

The selected continuation is returned with a new lease. Active work whose lease expires is surfaced as `stale` and can be reclaimed. Ref updates use compare-and-swap semantics, so concurrent agents cannot silently overwrite the same work state.

Finish only after evidence supports a decision:

```bash
usegit finish WORK-1234ABCD --decision accepted --summary "quality improved within GPU budget"
```

## Pull requests are not work items

A task, agent, branch or experiment does not automatically deserve a pull request. Work remains in the causal graph until it has accepted evidence and can be grouped into a compatible integration set.

`usegit integration` answers whether that set can be integrated directly or whether a real boundary requires one PR for the entire set. Current explicit boundaries are human review, protected targets, releases and external contributors.

## Commit granularity

We deliberately compare three policies instead of hard-coding one:

- `coarse`: one whole experiment per commit;
- `fine`: one artifact or narrow implementation step per commit;
- `dynamic`: one falsifiable causal unit per commit, independent of file count.

The current hypothesis is that `dynamic` will preserve intent and revert precision without producing the coordination overhead of tiny commits. It is intentionally provisional.

## Usage

```bash
npm test
npm run init
npm run context
npm run status
npm run report
npm run next
npm run boundary -- .usegit/plan.json
npm run integration -- .usegit/integration.example.json
```

`context` is the first command an agent runs after entering a repository. It returns compact causal history plus active, awaiting, stale and completed work. `next` turns accumulated history back into an experiment candidate. `integration` derives PR creation from a real integration boundary instead of task count.

See `AGENTS.md` and `docs/protocol.md` before changing this repository.
