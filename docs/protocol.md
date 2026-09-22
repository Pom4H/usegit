# usegit coordination protocol

usegit coordinates concurrent coding agents. It does not define how project commits should be written or how agents should reason about a task.

## State

```text
refs/usegit/work/*
```

A WORK ref points to an immutable Git commit containing `work.json`. Transitions create another state commit and move the ref with compare-and-swap semantics.

WORK contains coordination facts only: goal, owner/lease, dependencies, file scopes, semantic resources, base commit/tree, wait state, evidence and terminal decision.

## Creation

`start` creates active work owned by the caller.

`enqueue` and `batch` create ready work without a lease. Workers claim ready work explicitly.

There is no automatic uncertainty/oracle/model-routing policy in the protocol.

## Queue

A ready item is blocked when a dependency is missing or unfinished, or when its file scope / semantic resources conflict with live work or a higher-priority ready item.

## Handoff

`await` persists an external event and success/failure continuations, then releases the lease. A later agent can reconstruct the state from Git and `resume`.

## Evidence

Evidence records trust, exact commit/tree, source, environment, quality and integrity digest.

Accepted work requires positive admissible observed/attested evidence for the exact tree at the decision point. Changing project code requires revalidation.

## Recovery

`doctor` checks WORK refs, lease/state invariants, stale leases, base drift/divergence, dependencies, conflicts, evidence integrity and accepted work without exact-tree evidence.

## Non-goals

usegit does not prescribe commit messages, commit trailers, hypotheses, experiments, commit granularity, branches, PRs, prompt context, dashboards, or model-routing policy.
