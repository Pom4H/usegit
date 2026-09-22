# Agent protocol

This repository is a self-hosting experiment. The development process is part of the product data.

1. Run `npm run context` before editing. Do not reconstruct history from the current tree alone.
2. Inspect `work.workerReady`, `work.queueBlocked`, `work.controlQueue`, `work.active`, `work.awaiting`, `work.stale` and `work.conflicts` before starting anything. Do not duplicate existing work.
3. Control agents create `WORK-*` units before implementation, preferably as a batch. Declare scopes, explicit success criteria, evidence plans, priorities and dependencies; then inspect routing and queue blocking.
4. Cheap workers only claim tasks present in `work.workerReady`. Prefer `usegit claim-next` so workers self-schedule by priority; do not take control-queue work.
5. An unexpired lease means another agent owns the next decision for that work. Never steal it. An expired lease is surfaced as `stale` and may be resumed.
6. Cheap workers must not make architecture decisions, resolve conflicting evidence, or continue after repeated unexplained failures. Use `usegit escalate WORK-* --reason ...` and release the decision back to control.
7. Control agents own hypothesis selection and escalations; worker agents own only the bounded next action encoded in an execution-ready WORK.
8. Before waiting on CI or another external event, run `usegit await WORK-* --event ...` and store success/failure continuations. Awaiting releases the lease so the current invocation may safely end.
9. A later invocation starts from `usegit context`, then uses `usegit resume WORK-* --result ...` when the awaited evidence exists. Chat history must not be required for resumption.
10. Work under an existing `Usegit-Experiment` or create an experiment record before implementation.
11. State one falsifiable hypothesis for the causal unit you are changing.
12. Decide commit boundaries with `.usegit/plan.json` and `npm run boundary -- .usegit/plan.json`. Treat the recommendation as evidence, not law.
13. Every non-merge commit after bootstrap must carry these trailers:

   ```text
   Usegit-Change-Id: UG-xxxx
   Usegit-Experiment: EXP-xxxx
   Usegit-Intent: short-stable-intent
   Usegit-Hypothesis: falsifiable-statement-or-id
   Usegit-Granularity: coarse|fine|dynamic
   Usegit-Decision: pending|accepted|rejected|falsified
   ```

14. Keep a stable `Usegit-Change-Id` while revising the same conceptual change. A new SHA is a revision, not necessarily a new idea.
15. After CI, inspect `git notes --ref=usegit show <sha>` when available. Evidence belongs in notes; conclusions that must survive tool loss belong in the experiment record or a later decision commit.
16. Preserve negative knowledge. If a hypothesis failed under known conditions, record that result rather than deleting the attempt and repeating it later.
17. Run `npm run next` after the experiment changes state. Use the output to choose the next falsifiable step.
18. Never optimize commit size for aesthetics. A commit is good when one causal claim can be independently understood, tested and reverted.
19. Do not create a pull request merely because an agent or work item exists. PRs are optional integration artifacts, not work containers.
20. When a set of work items has accepted evidence, evaluate it with `npm run integration -- <plan.json>`. Create at most one PR for that integration set, and only when the policy reports a real human-review, protected-target, release or external-contributor boundary.
