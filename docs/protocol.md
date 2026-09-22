# usegit protocol

## Invariant

A model invocation is disposable. Git owns durable WORK state.

## Storage

`refs/usegit/work/*`

Each ref points to a commit containing `work.json`. Every transition creates another state commit and moves the ref with compare-and-swap semantics.

## Lifecycle

```text
ready -- claim --> active -- await --> awaiting
                     |                |
                     | finish         | resume
                     v                v
                 accepted           active
                 rejected
                 falsified

active -- lease expires --> stale -- resume --> active
active -- escalate --> escalated -- resume --> active
```

`start` creates active owned WORK. `enqueue` and `batch` create ready unowned WORK.

## Ownership

Active WORK has an expiring lease. An unexpired lease cannot be stolen. Remote state publication fails closed when another agent moved the ref first.

## Queue

Ready WORK is ordered by priority and filtered by accepted dependencies, file-scope reservations and semantic read/write resources. Missing scopes block queued WORK because independence is unknown.

## Handoff

`await` stores the external event plus success/failure continuations and releases the lease. A later process or clone can reconstruct the WORK from Git and `resume` it.

## Evidence

Evidence carries trust, result, source, exact commit/tree, environment fingerprint, quality and integrity digest. Acceptance-grade evidence is successful, observed/attested, integrity-valid and for the exact current tree.

`accepted` WORK records the exact decision tree and must have matching acceptance-grade evidence.

## Doctor

`doctor` detects malformed refs, lease errors, missing/diverged bases, missing dependencies, live reservation conflicts, bad evidence provenance/integrity and accepted WORK without matching evidence.

`doctor --repair` may synchronize remote WORK refs. It does not invent evidence, decisions or ownership.
