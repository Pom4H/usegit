# Agent protocol

This repository is a self-hosting experiment. The development process is part of the product data.

1. Run `npm run agents` before editing. It compiles the current decision-critical context from Git/WORK/experiments. Use `npm run context` only when you need the raw structured state; do not reconstruct history from the current tree alone.
2. Inspect `work.workerReady`, `work.queueBlocked`, `work.controlQueue`, `work.active`, `work.awaiting`, `work.stale` and `work.conflicts` before starting anything. Do not duplicate existing work.
3. Control agents create `WORK-*` units before implementation, preferably as a batch. Declare file scopes plus semantic read/write resources, explicit success criteria, evidence plans, priorities and dependencies.
4. Cheap workers only claim tasks present in `work.workerReady`. Prefer `usegit claim-next`; do not take control-queue work.
5. Treat semantic resources as part of concurrency correctness. File disjointness is not proof of independence. Declare shared metrics, budgets, protocols, schemas, architectural invariants or subsystem state with `--resource-read` / `--resource-write`.
6. An unexpired lease means another agent owns the next decision for that work. Never steal it. An expired lease is surfaced as `stale` and may be explicitly reclaimed.
7. Cheap workers must not make architecture decisions, resolve conflicting evidence, or continue after repeated unexplained failures. Use `usegit escalate WORK-* --reason ...` and release the decision back to control.
8. Before waiting on CI or another external event, run `usegit await WORK-* --event ...` and store success/failure continuations. Awaiting releases the lease so the current invocation may safely end.
9. A later invocation starts from `usegit context`, then uses `usegit resume WORK-* --result ...` when the awaited evidence exists. Chat history must not be required for resumption.
10. Evidence trust matters. `asserted` means an agent said it; `observed` means a runner/tool observed it; `attested` means a trusted external/human source attested it. Never promote asserted evidence into observed evidence.
11. `accepted` requires positive observed/attested evidence for the exact current Git tree. If code changes after validation, revalidate before finishing. Use `usegit evidence WORK-* --kind observed|attested --source ... --result success ...`.
12. Run `usegit doctor` before integration when state is ambiguous. `doctor --repair` may synchronize refs/notes, but must never be treated as permission to invent decisions, evidence or ownership.
13. Work under an existing `Usegit-Experiment` or create an experiment record before implementation.
14. State one falsifiable hypothesis for the causal unit you are changing.
15. Decide commit boundaries with `.usegit/plan.json` and `npm run boundary -- .usegit/plan.json`. Treat the recommendation as evidence, not law.
16. Every non-merge commit after bootstrap must carry these trailers:

   ```text
   Usegit-Change-Id: UG-xxxx
   Usegit-Experiment: EXP-xxxx
   Usegit-Intent: short-stable-intent
   Usegit-Hypothesis: falsifiable-statement-or-id
   Usegit-Granularity: coarse|fine|dynamic
   Usegit-Decision: pending|accepted|rejected|falsified
   ```

17. Keep a stable `Usegit-Change-Id` while revising the same conceptual change. A new SHA is a revision, not necessarily a new idea.
18. CI evidence in `refs/notes/usegit` must retain exact commit/tree and environment provenance. Conclusions that must survive tool loss belong in the experiment record or a later decision commit.
19. Preserve negative knowledge with validity conditions. Do not silently retry an equivalent failed hypothesis under unchanged conditions.
20. Run `npm run next` after an experiment changes state. Use accumulated evidence to choose the next falsifiable step.
21. Never optimize commit size for aesthetics. A commit is good when one causal claim can be independently understood, tested and reverted.
22. Do not create a pull request merely because an agent or work item exists. PRs are optional integration artifacts, not work containers.
23. When a set of work items has accepted evidence, evaluate it with `npm run integration -- <plan.json>`. Create at most one PR for that integration set, and only when a real human-review, protected-target, release or external-contributor boundary exists.
24. When a user asks to see or understand the project as a dashboard, project view or interactive HTML, prefer the disposable human projection: `usegit view --output usegit.html`. In ChatGPT or another agent surface, use the same `buildViewModel` / `renderView` contract and return the HTML artifact. Do not make raw commit messages, SHAs, refs or PRs the primary human interface; keep them as provenance. The HTML never becomes source of truth and must not write decisions back into Git.
25. Treat compiled agent context the same way: `usegit agents` is a disposable prompt projection. `usegit agents --write` may cache it under `.git/usegit/AGENTS.md`; never commit that runtime snapshot or treat it as canonical state.
