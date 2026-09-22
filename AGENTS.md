# Agent protocol

This repository dogfoods usegit's coordination core.

1. Run `npm run status` before taking shared work.
2. Use `start` for work you own now; use `enqueue` or `batch` for claimable pool work.
3. Workers use `claim-next`; never steal an unexpired lease.
4. Use scopes and semantic resources for parallel work.
5. Persist waits with `await`; a fresh agent can `resume` from Git refs.
6. Accepted work needs observed/attested successful evidence for the exact current tree.
7. Run `doctor` when state looks inconsistent.
8. Commit normally. usegit does not require trailers, hypotheses, experiments, or special commit granularity.
