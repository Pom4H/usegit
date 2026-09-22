# usegit

Git-native coordination for coding agents.

usegit keeps shared agent work durable and race-safe in Git. Project commits remain ordinary Git commits.

## Start

```bash
npx --yes github:Pom4H/usegit#main init
usegit status
```

## Work you own now

```bash
usegit start --id WORK-42 --goal "fix cache invalidation" --scope "src/cache/**"
```

`start` creates active work with your lease.

## Work for a pool

```bash
usegit enqueue --id WORK-43 --goal "fix parser" --scope "src/parser/**"
usegit claim-next
```

`enqueue` creates lease-free ready work. `batch` publishes several ready items at once.

The queue uses only coordination facts: dependencies, file scopes, semantic resources and priority. It does not try to classify task uncertainty or decide which model should do the work.

## Wait and resume

```bash
usegit await WORK-42 --event ci:test --on-success "finish after checking CI"
```

The lease is released. A fresh agent can later recover from Git alone:

```bash
usegit status
usegit resume WORK-42 --result success --evidence "tests passed" --evidence-kind observed --evidence-source "github-actions:412"
```

## Exact-tree evidence

Observed/attested evidence records the exact Git tree. If project code changes, old evidence cannot accept the new tree.

```bash
usegit evidence WORK-42 --kind observed --source "github-actions:412" --result success
usegit finish WORK-42 --decision accepted
```

Asserted agent text alone cannot accept work.

## State

Runtime state lives in:

```text
refs/usegit/work/*
```

Each transition creates an immutable Git state commit containing `work.json`, then moves the WORK ref with compare-and-swap semantics.

## Commands

```text
usegit status
usegit start
usegit enqueue
usegit batch
usegit claim
usegit claim-next
usegit await
usegit resume
usegit evidence
usegit finish
usegit escalate
usegit doctor
```

## Non-goals

usegit does not prescribe commit messages, trailers, commit granularity, branch strategy, PR strategy, prompt formats, agent memory summaries or dashboards.

If ordinary Git plus ordinary agent commits coordinate concurrent agents just as well, usegit has no reason to exist.

MIT.
