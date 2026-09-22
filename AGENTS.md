# Agent instructions

<!-- usegit:start -->
## Causal Git memory and durable work

This repository uses usegit as design-time memory and durable execution state. A model invocation owns only the next decision; Git owns the work state.

1. Before editing, run `npx --yes github:Pom4H/usegit#experiment/causal-memory-v0 context`. Inspect causal history plus `work.active`, `work.awaiting`, and `work.stale`; do not duplicate existing work.
2. Before implementation, create or claim a `WORK-*` unit. Set a unique `USEGIT_AGENT_ID` when multiple agents can run concurrently.
3. Never steal an unexpired lease. Before waiting on CI or another external event, persist the continuation with `npx --yes github:Pom4H/usegit#experiment/causal-memory-v0 await WORK-* --event ...`. A later fresh invocation resumes with `npx --yes github:Pom4H/usegit#experiment/causal-memory-v0 resume WORK-* --result ...`.
4. Work under an experiment with one falsifiable hypothesis. Create an experiment record when no existing experiment covers the change.
5. Keep one stable `Usegit-Change-Id` across revisions of the same conceptual change.
6. Every non-merge commit after the bootstrap commit must include `Usegit-Change-Id`, `Usegit-Experiment`, `Usegit-Intent`, `Usegit-Hypothesis`, `Usegit-Granularity`, and `Usegit-Decision` trailers.
7. Treat commit granularity as dynamic: one independently falsifiable causal unit. Implementation, its directly coupled test, and minimum documentation may belong together.
8. Preserve rejected and falsified hypotheses with their conditions. Do not silently retry equivalent failed work.
9. Pull requests are integration boundaries, not work containers. Do not create a PR per task or agent. Use `npx --yes github:Pom4H/usegit#experiment/causal-memory-v0 integration -- <plan.json>` after evidence is accepted.
10. After an experiment changes state, run `npx --yes github:Pom4H/usegit#experiment/causal-memory-v0 next` and let accumulated evidence propose the next falsifiable step.

<!-- usegit:end -->
