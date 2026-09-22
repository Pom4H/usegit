# Commit granularity experiment

The unit under test is not "small commit" versus "large commit". It is the rule used to decide a boundary.

## Variants

| Variant | Boundary rule | Expected failure mode |
| --- | --- | --- |
| coarse | one experiment | unrelated causal claims become coupled |
| fine | one artifact/step | history fragments and coordination cost rises |
| dynamic | one independently falsifiable causal unit | agents may invent causal units inconsistently |

## Measurements

We record cheap objective proxies automatically: changed lines, changed files, commits per experiment, structured metadata coverage and unresolved decisions.

Those proxies are not enough to declare a winner. The important measurements need replay:

1. **Reconstruction cost** — give an agent only repository history and measure how much context/tooling it needs to explain why the current state exists.
2. **Revert precision** — ask the agent to undo one rejected hypothesis without disturbing accepted work.
3. **Repeated-work rate** — after a context reset, count attempts that repeat a previously falsified hypothesis under equivalent conditions.
4. **Metadata overhead** — bytes/tokens written only to maintain the causal graph.

## Experimental rule

Do not normalize commits toward a preferred size during the trial. Use the assigned policy honestly. A large dynamic commit is valid when every file is required by one causal claim; a two-line commit is too large if it mixes two independent claims.

No policy may be selected before each variant has at least three samples and at least one replay measurement.
