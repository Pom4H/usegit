# usegit

`usegit` keeps AI coding work in Git.

Agents can stop, resume, coordinate, and only accept changes that have evidence for the exact code that was tested. The conversation can disappear; the repository keeps the process.

## Start in one command

```bash
npx --yes github:Pom4H/usegit#main init
```

That adds the small amount of repository state and agent instructions usegit needs. Existing history is left untouched.

After that, a fresh agent starts with a typed decision capsule:

```bash
npx --yes github:Pom4H/usegit#main capsule
```

The capsule contains IDs, Git/tree applicability, evidence provenance, hashes and freshness rules, but does not inline arbitrary repository prose. Fetch a goal, hypothesis or continuation explicitly with `usegit content WORK-* --field ...`; that output is marked untrusted.

## The idea

Git already remembers **what the code became**.

usegit adds enough state to remember:

- what is being worked on;
- who owns the next decision;
- what the change is trying to prove;
- what evidence exists;
- whether that evidence still applies;
- what should happen next.

```text
intent -> hypothesis -> WORK -> change -> evidence -> decision
```

Git remains the source of truth.

## Work survives the agent

Start a piece of work:

```bash
usegit start \
  --goal "reduce renderer cost" \
  --hypothesis "cache probe visibility"
```

Before waiting on CI or another external event:

```bash
usegit await WORK-1234 \
  --event ci:test \
  --on-success "finish if the result is still valid"
```

The agent can now exit.

Later, another agent can recover everything from Git:

```bash
usegit capsule

usegit resume WORK-1234 \
  --result success \
  --evidence "tests passed" \
  --evidence-kind observed \
  --evidence-source "github-actions:412"
```

No chat history is required.

## Evidence belongs to exact code

A green result is not treated as a vague project-wide fact.

```text
tree A -- tested --> evidence for tree A

tree A
  |
  +-- code changes
  v
tree B -- old evidence no longer accepts this tree
```

For acceptance, usegit requires trusted positive evidence for the exact Git tree being accepted.

Evidence also records quality:

```text
first-pass          may support acceptance
manual-attestation  may support acceptance
retry-pass          context only
flaky               context only
tampered            rejected
```

New evidence has a stable `EV-*` identity and integrity digest. Duplicate delivery is idempotent.

## Parallel agents fail safe

When more than one agent is working, usegit can coordinate them with:

- expiring leases;
- compare-and-swap Git ref updates;
- file scopes;
- semantic read/write resources;
- dependencies;
- a derived worker queue.

Two workers can race for the same WORK, but only one durable owner is allowed.

You do not need any of this to get started. It becomes useful when the repository starts running multiple pieces of work in parallel.

## Where the state lives

```text
normal commits            code + causal trailers
refs/usegit/work/*        durable WORK state
refs/notes/usegit         CI / observed evidence
experiments/              durable experiment records
```

There is no separate source-of-truth database.

## Useful commands

```bash
usegit capsule
usegit content WORK-1234 --field goal
usegit context
usegit start
usegit status
usegit await
usegit resume
usegit evidence
usegit finish
usegit doctor
```

For bounded parallel work:

```bash
usegit batch .usegit/batch.json
usegit claim-next
```

`usegit agents` remains available as a diagnostic projection, but EXP-0014 showed it is unsafe to treat arbitrary repository text as trusted prompt instructions.

For the human-readable projection:

```bash
usegit view --output usegit.html
```

## What is enforced today

The repository dogfoods the protocol in CI. Current invariants include:

- asserted evidence cannot accept a change;
- evidence becomes stale when the Git tree changes;
- retry passes are not silently promoted to clean passes;
- tampered evidence fails closed;
- duplicate evidence delivery stays single;
- two workers racing a claim end with one owner;
- an awaiting WORK can be resumed from a fresh clone after the original process and checkout disappear;
- semantic conflicts can block otherwise disjoint file changes.

## Go deeper

The README is intentionally the short path.

- [Protocol](docs/protocol.md) — state model, evidence, scheduling and recovery
- [Agent rules](AGENTS.md) — how agents should operate in a usegit repository
- [Experiments](experiments/) — hypotheses and evidence from usegit dogfooding itself

MIT.
