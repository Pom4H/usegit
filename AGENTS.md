# Agent protocol

This repository is a self-hosting experiment. The development process is part of the product data.

1. Run `npm run context` before editing. Do not reconstruct history from the current tree alone.
2. Work under an existing `Usegit-Experiment` or create an experiment record before implementation.
3. State one falsifiable hypothesis for the causal unit you are changing.
4. Decide commit boundaries with `.usegit/plan.json` and `npm run boundary -- .usegit/plan.json`. Treat the recommendation as evidence, not law.
5. Every non-merge commit after bootstrap must carry these trailers:

   ```text
   Usegit-Change-Id: UG-xxxx
   Usegit-Experiment: EXP-xxxx
   Usegit-Intent: short-stable-intent
   Usegit-Hypothesis: falsifiable-statement-or-id
   Usegit-Granularity: coarse|fine|dynamic
   Usegit-Decision: pending|accepted|rejected|falsified
   ```

6. Keep a stable `Usegit-Change-Id` while revising the same conceptual change. A new SHA is a revision, not necessarily a new idea.
7. After CI, inspect `git notes --ref=usegit show <sha>` when available. Evidence belongs in notes; conclusions that must survive tool loss belong in the experiment record or a later decision commit.
8. Preserve negative knowledge. If a hypothesis failed under known conditions, record that result rather than deleting the attempt and repeating it later.
9. Run `npm run next` after the experiment changes state. Use the output to choose the next falsifiable step.
10. Never optimize commit size for aesthetics. A commit is good when one causal claim can be independently understood, tested and reverted.
