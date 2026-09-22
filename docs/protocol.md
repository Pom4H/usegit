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

## Semantic resources

Filesystem scopes are necessary but not sufficient for concurrency. WORK may also claim semantic resources:

```text
renderer.lighting       write
metric.reality-gap      read
gpu.frame-budget        read
protocol.modbus.*       write
```

Names are hierarchical. Exact names, `namespace.*`, and `*` are supported. Two read claims may execute concurrently; any overlapping pair containing a write is a conflict. The worker queue applies both filesystem scopes and semantic resource claims when constructing its independent dispatch set.

Semantic resources are intentionally declarative rather than inferred as truth from imports. Static analysis may suggest claims later, but an inference engine must not silently weaken an explicit reservation.

## Evidence provenance and tree-exact acceptance

Evidence records distinguish provenance:

- `asserted`: supplied by an agent; useful context but zero acceptance trust;
- `observed`: produced by a runner/tool with a named source;
- `attested`: produced by a trusted external/human source.

Observed and attested evidence must name an exact Git tree and source. The runtime also captures commit, environment snapshot, and a deterministic environment fingerprint.

```text
tree T0 -- observed success --> valid evidence for T0
   |
   +-- code change --> tree T1
                       |
                       +-- old evidence does not accept T1
```

`finish --decision accepted` therefore requires positive observed/attested evidence whose subject tree equals the tree at the decision point. This turns base drift into a required revalidation rather than a social convention.

CI notes under `refs/notes/usegit` use the same provenance model, so evidence transport and WORK evidence share one trust vocabulary.

Evidence also carries **quality** and **integrity** semantics. A clean tool observation is `first-pass`; a rerun that only passes after retry is `retry-pass`; flaky/quarantined/derived observations remain contextual rather than acceptance-grade. Human/external attestation is recorded as `manual-attestation`. By default only positive `first-pass` observations and positive `manual-attestation` records may support acceptance.

Every new evidence object has a stable content-derived `EV-*` identity and SHA-256 digest. Re-delivery of the same evidence identity is idempotent. A stored payload whose digest no longer matches is treated as tampered and cannot support acceptance. Legacy evidence without a digest remains readable for migration compatibility but `doctor` reports it.

GitHub Actions provenance records the run id and attempt. Attempts greater than one are materialized as `retry-pass`, so a green rerun is not silently promoted to the same epistemic status as a clean first pass.

## Doctor and reconciliation

`usegit doctor` is a consistency checker for the development runtime. It validates Git-backed WORK state rather than application code.

It detects:

- malformed WORK refs and impossible lease/state combinations;
- missing or diverged base commits;
- missing WORK dependencies;
- live filesystem or semantic resource collisions;
- trusted evidence pointing at missing Git objects or missing environment provenance;
- accepted WORK without a matching decision tree and successful trusted evidence.

The default is read-only. `usegit doctor --repair` is deliberately conservative: it only synchronizes remote `refs/usegit/work/*` and `refs/notes/usegit`. It does not steal leases, rewrite decisions, manufacture evidence, or auto-resolve conflicts.

This is the recovery principle: **detect broadly, repair only what is mechanically unambiguous**.

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
