# Agent protocol

This repository is a self-hosting experiment. The development process is part of the product data.

1. Run `npm run context` before editing. Do not reconstruct history from the current tree alone.
2. Inspect `work.active`, `work.awaiting` and `work.stale` before starting anything. Do not duplicate existing work.
3. Create or claim a `WORK-*` unit before implementation. Set a unique `USEGIT_AGENT_ID` when agents can run concurrently.
4. An unexpired lease means another agent owns the next decision for that work. Never steal it. An expired lease is surfaced as `stale` and may be resumed.
5. Before waiting on CI or another external event, run `usegit await WORK-* --event ...` and store success/failure continuations. Awaiting releases the lease so the current invocation may safely end.
6. A later invocation starts from `usegit context`, then uses `usegit resume WORK-* --result ...` when the awaited evidence exists. Chat history must not be required for resumption.
7. Work under an existing `Usegit-Experiment` or create an experiment record before implementation.
8. State one falsifiable hypothesis for the causal unit you are changing.
9. Decide commit boundaries with `.usegit/plan.json` and `npm run boundary -- .usegit/plan.json`. Treat the recommendation as evidence, not law.
10. Every non-merge commit after bootstrap must carry these trailers:

   ```text
   Usegit-Change-Id: UG-xxxx
   Usegit-Experiment: EXP-xxxx
   Usegit-Intent: short-stable-intent
   Usegit-Hypothesis: falsifiable-statement-or-id
   Usegit-Granularity: coarse|fine|dynamic
   Usegit-Decision: pending|accepted|rejected|falsified
   ```

11. Keep a stable `Usegit-Change-Id` while revising the same conceptual change. A new SHA is a revision, not necessarily a new idea.
12. After CI, inspect `git notes --ref=usegit show <sha>` when available. Evidence belongs in notes; conclusions that must survive tool loss belong in the experiment record or a later decision commit.
13. Preserve negative knowledge. If a hypothesis failed under known conditions, record that result rather than deleting the attempt and repeating it later.
14. Run `npm run next` after the experiment changes state. Use the output to choose the next falsifiable step.
15. Never optimize commit size for aesthetics. A commit is good when one causal claim can be independently understood, tested and reverted.
16. Do not create a pull request merely because an agent or work item exists. PRs are optional integration artifacts, not work containers.
17. When a set of work items has accepted evidence, evaluate it with `npm run integration -- <plan.json>`. Create at most one PR for that integration set, and only when the policy reports a real human-review, protected-target, release or external-contributor boundary.
