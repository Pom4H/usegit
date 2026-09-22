# Agent protocol

This repository uses usegit for durable coordination between coding agents.

1. Run `npm run status` before taking work.
2. `start` creates active WORK owned by you. `enqueue` or `batch` creates ready WORK for any agent.
3. Prefer `claim-next` for ready WORK. Never steal an unexpired lease.
4. Declare dependencies, file scopes and semantic resources when work may conflict.
5. Persist waits with `await`; another agent may later `resume` from Git.
6. Only mark WORK `accepted` after observed/attested success evidence for the exact current tree.
7. Use `doctor` when durable state is ambiguous.
