# Agent protocol

This repository uses usegit for durable coordination between coding agents.

1. Run `npm run status` before taking work.
2. Claim ready WORK with `claim-next`; never steal an unexpired lease.
3. Declare dependencies, file scopes and semantic resources for concurrent work.
4. Persist external waits with `await`; another agent may later `resume` from Git.
5. Only mark WORK `accepted` after observed/attested success evidence for the exact current tree.
6. Use `doctor` when durable state is ambiguous.
