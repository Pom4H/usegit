# Causal Git protocol v0

## Goal

Make repository history useful to an AI agent at design time, not merely auditable after the fact.

A snapshot answers **what exists**. The causal history should answer **why it exists, what alternatives were tested, what evidence changed the decision, and which assumptions are still unresolved**.

## Three linked graphs

1. **Intent graph** — goals, hypotheses, dependencies and supersession.
2. **Change graph** — normal Git commits and parent edges.
3. **Evidence graph** — CI observations attached to commits through `refs/notes/usegit`.

The graphs are intentionally not collapsed into one giant commit message. Commit trailers are indexes and stable links; experiment records are durable knowledge; notes are mutable/materialized observations.

## Negative knowledge

Rejected and falsified hypotheses are first-class results. Deleting failed attempts destroys information and causes future agents to revisit the same dead ends.

A result is only reusable when its conditions are explicit. `H failed` is weak. `H failed under scene S, seed 42 and GPU budget B` can prevent repeated work.

## Commit boundaries

The repository is testing, not assuming, the right granularity.

Candidate rule for `dynamic`: **one commit = one falsifiable causal unit**. Split when two groups of changes can be independently accepted, rejected or reverted. Keep implementation, its directly coupled test and the minimum documentation together even if that spans directories.

Line count and file count are secondary safety signals. They may indicate that the proposed causal unit is too broad, but they do not define the unit.

## Stable identity

A SHA identifies a concrete revision. `Usegit-Change-Id` identifies the conceptual change across amendments, rebases and repair iterations. `Usegit-Experiment` identifies the question being tested.

## Recursion

The closed loop is:

```text
history -> report -> weakest/unknown assumption -> next experiment
   ^                                             |
   +------------- change <- evidence <-----------+
```

`npm run next` implements the first deliberately simple policy. The policy itself is versioned and must be improved by experiments in this same repository.
