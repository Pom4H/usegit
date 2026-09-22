# Causal Git protocol v0

## Core invariant

**A model invocation is disposable. The repository owns durable development state.**

usegit keeps enough process state in Git for work to survive agent exits, context loss, CI waits, retries and handoffs between independent agents.

The protocol answers:

- what is being worked on;
- who owns the next decision;
- what the change is trying to prove;
- what evidence exists for the current code;
- whether that evidence is still admissible;
- what can safely happen next.

Git remains the source of truth.

## Storage model

usegit does not require a separate state database.

```text
normal commits            code + causal trailers
refs/usegit/work/*        mutable pointers to durable WORK state
refs/notes/usegit         CI / observed evidence attached to commits
experiments/              durable experiment records
```

Each `WORK-*` ref points to a small Git commit containing `work.json`. Each state transition creates another immutable state commit and moves the ref with compare-and-swap semantics.

That makes current state mutable while preserving transition history.

## WORK lifecycle

A model owns only the next decision, not the lifetime of the work.

```text
ready
  |
  | claim
  v
active -- await(event) --> awaiting
  |                         |
  | finish                  | resume(result)
  v                         v
accepted                 active
rejected
falsified
```

### Ready

Worker-routable WORK can exist without an owner or lease.

### Active

Active WORK has a lease:

```text
owner
acquiredAt
expiresAt
```

An unexpired lease prevents another agent from taking the same next decision.

Lease expiry does not mutate stored state. `status` derives `stale` from the current clock, after which explicit takeover is allowed.

### Awaiting

`usegit await` persists:

- the external event being waited for;
- success and failure continuations;
- the current WORK state.

The lease is released. The model invocation may disappear.

A later agent starts with:

```bash
usegit context
```

and can resume the WORK from Git alone.

### Terminal states

WORK ends as one of:

```text
accepted
rejected
falsified
```

An accepted WORK must satisfy the evidence rules below.

## Evidence model

Evidence is not a project-wide green/red flag. It has provenance and an exact subject.

### Trust

```text
asserted   agent statement; context only
observed   runner/tool observation
attested   trusted external or human attestation
```

`observed` and `attested` evidence require a named source and exact Git tree.

### Exact-tree acceptance

```text
tree T0 -- observed success --> evidence for T0
   |
   +-- code changes
   v
tree T1 -- old evidence cannot accept T1
```

`usegit finish WORK-* --decision accepted` requires successful admissible evidence whose subject tree equals the tree at the decision point.

Changing the code after validation requires revalidation.

### Evidence quality

A positive result is not automatically acceptance-grade.

```text
first-pass          admissible
manual-attestation  admissible
retry-pass          context only
flaky               context only
quarantined         context only
derived             context only
untrusted           context only
```

A GitHub Actions run with `runAttempt > 1` is materialized as `retry-pass`, not silently treated as a clean first pass.

### Identity and integrity

New evidence has:

- a stable content-derived `EV-*` identity;
- a SHA-256 integrity digest;
- source and exact subject tree;
- environment fingerprint;
- optional run provenance and artifact metadata.

Re-delivery of the same evidence identity is idempotent.

If the stored payload no longer matches its digest, the evidence is treated as tampered and cannot support acceptance.

Legacy evidence without a digest remains readable, but `doctor` reports it.

## Concurrency

File-level independence is not enough to prove that two pieces of work are safe to execute together.

usegit coordinates concurrent WORK with:

- leases;
- compare-and-swap ref updates;
- file scopes;
- semantic resources;
- dependencies;
- derived queue state.

### File scopes

Scopes are explicit paths, subtrees such as `src/render/**`, or `**`.

Overlapping live scopes reserve the same causal surface.

### Semantic resources

WORK can declare read/write access to hierarchical semantic resources:

```text
renderer.lighting       write
metric.reality-gap      read
gpu.frame-budget        read
protocol.modbus.*       write
```

Two reads may run concurrently.

Any overlapping pair containing a write conflicts, even when the files themselves are disjoint.

Resource claims are declarative. Static analysis may suggest claims later, but must not silently weaken explicit reservations.

### Dependencies

A worker-ready item remains blocked while a dependency is:

- missing;
- unfinished;
- rejected;
- falsified.

Dependencies unblock when their required WORK reaches `accepted`.

### Queue derivation

The worker queue is derived from durable WORK state rather than stored as another database.

Candidates are ordered by priority, then filtered into a deterministic scope/resource-safe independent set.

Multiple stateless workers may call:

```bash
usegit claim-next
```

They may race for the same candidate, but compare-and-swap ref updates allow only one durable owner. Losers retry against the new state.

## Routing

Routing is based on WORK properties, not on a hard-coded model identity.

The current implemented policy routes to the worker lane only when all of the following hold:

- uncertainty is `low`;
- the oracle is `objective`;
- success criteria are explicit;
- an evidence plan is explicit;
- no architecture decision is declared;
- no evidence conflict is declared;
- fewer than three failed attempts are declared;
- a file scope exists.

Otherwise the WORK remains in the control lane.

Workers can escalate unexpected ambiguity back to control with:

```bash
usegit escalate WORK-* --reason "..."
```

The labels `instant` and `deep` are current routing metadata, not protocol-level requirements on any specific model provider.

## Recovery and doctor

`usegit doctor` checks the consistency of the Git-backed development state.

It detects, among other things:

- malformed WORK refs;
- impossible lease/state combinations;
- stale leases;
- missing or diverged base commits;
- missing dependencies;
- live file-scope conflicts;
- live semantic-resource conflicts;
- trusted evidence pointing to missing Git objects;
- missing environment provenance;
- evidence integrity failures;
- positive evidence that is not acceptance-grade;
- accepted WORK without matching exact-tree evidence.

The default is read-only.

`usegit doctor --repair` is intentionally conservative. It may synchronize remote WORK refs and evidence notes, but it does not:

- invent evidence;
- change decisions;
- steal leases;
- resolve semantic conflicts;
- manufacture missing state.

Recovery rule:

> Detect broadly. Repair only what is mechanically unambiguous.

## Causal commit metadata

Meaningful non-merge commits after the bootstrap boundary carry:

```text
Usegit-Change-Id
Usegit-Experiment
Usegit-Intent
Usegit-Hypothesis
Usegit-Granularity
Usegit-Decision
```

A Git SHA identifies a concrete revision.

`Usegit-Change-Id` identifies the conceptual change across revisions.

`Usegit-Experiment` identifies the experiment.

`WORK-*` identifies durable execution state across model invocations and owners.

Commit trailers are indexes and links. They are not intended to contain the full protocol state.

## Integration

A pull request is not a WORK container.

Current integration policy evaluates a proposed set of WORK items:

```text
unfinished work
    -> wait

conflicting work
    -> resolve conflicts

accepted + compatible work
    -> direct merge
       or
    -> one PR when a boundary exists
```

The currently implemented PR boundary reasons are:

- human review;
- protected target;
- release boundary;
- external contributor / trust boundary.

The integration command is currently a policy evaluator over an explicit integration plan. It does not yet autonomously perform the whole integration lifecycle.

## Negative knowledge

Rejected and falsified hypotheses are durable results.

The currently implemented guard is intentionally narrow: if the same hypothesis was previously falsified, repeating it is reported unless the new change explicitly declares that conditions changed.

This prevents obvious repeated dead ends, but it is not yet a general condition or counterexample model.

## Provisional policy

The following mechanisms exist and are useful, but are still experimental policy rather than stable protocol semantics.

### Commit granularity

The repository currently compares:

- `coarse`;
- `fine`;
- `dynamic`.

The working hypothesis for `dynamic` is:

> one commit = one falsifiable causal unit

This remains under experiment and is not a universal protocol requirement.

### Control / worker routing thresholds

The current routing thresholds are implemented policy and may change as evidence accumulates.

The protocol requirement is weaker: durable WORK must expose enough state for routing and ownership decisions to be reconstructed.

### `usegit next`

`usegit next` is currently a dogfooding experiment-selection policy.

It still contains usegit-specific heuristics around commit-granularity experiments and unresolved experiment ordering. It should not yet be treated as a general autonomous planner.

### Rich negative knowledge

The current repeated-falsified-hypothesis check is only the first version of negative knowledge. A richer model may later represent explicit conditions, counterexamples and validity ranges.

## Tested invariants

The repository dogfoods this protocol in CI.

Current tests include:

- asserted evidence cannot accept WORK;
- evidence for an old tree cannot accept a changed tree;
- retry passes are not silently promoted to clean passes;
- tampered evidence fails closed;
- duplicate evidence delivery is idempotent;
- two independent workers racing for the same WORK produce one durable owner;
- awaiting WORK survives process and checkout loss and resumes from a fresh clone;
- semantic resource conflicts are detected across disjoint file scopes;
- malformed state is detected without unsafe automatic repair.

These tests are part of the protocol definition: behavior that cannot survive crash, race or stale evidence is not durable development state.
