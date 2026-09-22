# usegit protocol

## Invariant

A model invocation is disposable. Git owns durable WORK state.

## Storage

`refs/usegit/work/*`

Each ref points to a commit containing `work.json`. Every transition creates a state commit and moves the ref with compare-and-swap semantics.

## Lifecycle

```text
ready -> active -> awaiting -> active -> accepted|rejected|falsified
          |
          +-> stale
          +-> escalated
```

Active WORK has an expiring owner lease. Ready WORK is claimable. Awaiting WORK stores an external event and continuations while releasing its lease.

## Queue

Ready WORK is filtered by accepted dependencies, file scopes and semantic read/write resources. Compatible tasks may be claimed concurrently.

## Evidence

Observed/attested evidence records source, exact commit/tree, environment, quality and integrity digest. Accepted WORK must have successful acceptance-grade evidence for its exact decision tree.

## Recovery

`doctor` detects malformed refs, lease errors, base drift/divergence, missing dependencies, reservation conflicts, broken evidence and accepted WORK without matching evidence.
