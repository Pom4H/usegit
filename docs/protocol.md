# Causal Git protocol v0

## Goal

Make repository history useful to an AI agent at design time and make unfinished work durable across model invocations.

A snapshot answers **what exists**. The causal history should answer **why it exists, what alternatives were tested, what evidence changed the decision, which assumptions are unresolved, and what execution is currently suspended**.

## Four linked graphs

1. **Intent graph** — goals, hypotheses, dependencies and supersession.
2. **Change graph** — normal Git commits and parent edges.
3. **Evidence graph** — CI observations attached to commits through `refs/notes/usegit`.
4. **Work graph** — live execution state under `refs/usegit/work/*`.

The graphs are intentionally not collapsed into one giant commit message. Commit trailers are indexes and stable links; experiment records are durable knowledge; notes are observations; work refs are mutable execution pointers backed by immutable state commits.

## Durable work and leases

The model must not own process state. It owns only the next decision.

Each `WORK-*` ref points to a tiny Git commit containing `work.json`. Updating the work ref uses compare-and-swap semantics through `git update-ref <ref> <new> <old>`. State commits parent the previous state commit, so a work unit has its own auditable transition history.

```text
WORK active
   |
   | lease(owner, expiresAt)
   v
change / reason
   |
   | usegit await(event, continuations)
   v
WORK awaiting       <- no lease; invocation may disappear
   |
   | evidence arrives
   | usegit resume(result)
   v
WORK active         <- fresh lease, possibly a different agent
   |
   v
accepted | rejected | falsified
```

An active lease prevents another agent from taking the same next decision. Expiration does not rewrite history; `status` derives `stale` from the clock and permits takeover. Awaiting deliberately releases ownership because no model should consume a context window merely to poll infrastructure.

The first command in a fresh invocation is `usegit context`. It fetches the work namespace and returns a compact view of active, awaiting, stale and completed work together with causal history.

## Control and worker routing

The work graph is also a reasoning scheduler.

```text
goal / product judgement
        |
        v
control plane
  hypothesis + WORK contract
        |
        +-- ambiguous ----------------------> control queue
        |
        +-- low uncertainty
            objective oracle
            explicit success/evidence
                    |
                    v
              ready WORK
                    |
                 claim
                    v
              cheap worker
              /         \
         evidence       unexpected ambiguity
            |                    |
          finish              escalate
                                 |
                                 v
                            control queue
```

Routing is based on properties of the work, not a hard-coded model name. The current policy labels bounded execution as `instant` and ambiguous reasoning as `deep`. A worker-ready task is created without a lease so control does not own or serialize it; the worker acquires ownership with `claim`.

Automatic worker routing is intentionally conservative. Missing success/evidence contracts, medium or high uncertainty, partial/no oracle, architecture decisions, conflicting evidence, or three failed attempts keep the work in control. An explicit worker override remains visible as not-ready when blockers exist.

## Batch scheduling

Control may materialize many hypotheses at once as a batch. A batch is only a creation convenience; each WORK remains independently durable and falsifiable.

The worker queue is derived from current WORK state rather than stored as another database. Candidates are sorted by priority and then filtered into a deterministic independent set. A ready candidate is blocked when:

- a dependency is missing, failed or not yet accepted;
- an active, awaiting, escalated or stale WORK reserves an overlapping scope;
- a higher-priority ready candidate in the same dispatch set overlaps its scope;
- no scope was declared.

Because simultaneously dispatchable candidates are scope-independent, multiple stateless workers may safely call `claim-next`. They may race for the same highest-priority WORK, but ref compare-and-swap makes that a recoverable scheduling race rather than duplicate ownership.

```text
control
  |
  +-> batch plan
         |
         v
    durable ready WORK
         |
    queue derivation
      /      \
blocked     independent set
                |
        worker claim-next
                |
        CAS refs/usegit/work/*
```

## Negative knowledge

Rejected and falsified hypotheses are first-class results. Deleting failed attempts destroys information and causes future agents to revisit the same dead ends.

A result is only reusable when its conditions are explicit. `H failed` is weak. `H failed under scene S, seed 42 and GPU budget B` can prevent repeated work.

## Commit boundaries

The repository is testing, not assuming, the right granularity.

Candidate rule for `dynamic`: **one commit = one falsifiable causal unit**. Split when two groups of changes can be independently accepted, rejected or reverted. Keep implementation, its directly coupled test and the minimum documentation together even if that spans directories.

Line count and file count are secondary safety signals. They may indicate that the proposed causal unit is too broad, but they do not define the unit.

## Pull requests are integration boundaries

A pull request is not a unit of work, an agent mailbox or durable memory. Git already holds the work; causal metadata and evidence hold its meaning.

The default lifecycle is:

```text
work -> evidence -> accepted -> compatible integration set -> final validation
                                                     |-> direct merge
                                                     +-> one PR when a real boundary exists
```

Creating one PR per agent or work item is the baseline being challenged by `EXP-0005`.

The current policy recognizes four explicit reasons to materialize a PR:

- a human review is required;
- the target is protected and requires a PR;
- the integration crosses a release boundary;
- an external contributor/trust boundary requires review.

Multiple accepted work items behind the same boundary are batched into one integration set. Unfinished work produces no placeholder PR. Conflicting work is resolved before PR creation is considered.

## Stable identity

A SHA identifies a concrete revision. `Usegit-Change-Id` identifies the conceptual change across amendments, rebases and repair iterations. `Usegit-Experiment` identifies the question being tested. `WORK-*` identifies a durable execution unit across model invocations and owners.

## Recursion

The closed loop is:

```text
context -> next decision -> change -> evidence -> durable state
   ^                                      |
   |          await / invocation exit     |
   +--------------- resume <--------------+
```

`npm run next` implements the first deliberately simple experiment-selection policy. The policy itself is versioned and must be improved by experiments in this same repository.
