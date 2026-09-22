# usegit

Git-native coordination for coding agents.

usegit stores WORK state in Git refs so agents can claim work, hand it off, wait for CI, resume in a fresh process, and reject stale evidence.

## Start

```bash
npx --yes github:Pom4H/usegit#main init
usegit status
```

Take work:

```bash
usegit start --goal "fix renderer race" --hypothesis "the race disappears"
```

Queue compatible worker tasks with a batch, then:

```bash
usegit claim-next
```

Before waiting:

```bash
usegit await WORK-1234 --event ci:test --on-success "finish" --on-failure "inspect failure"
```

A later agent can resume from Git alone:

```bash
usegit resume WORK-1234 --result success --evidence "CI passed" --evidence-kind observed --evidence-source "github-actions:412"
```

Acceptance requires observed or attested evidence for the exact current Git tree.

State lives only in `refs/usegit/work/*`. No database, prompt cache, experiment framework or dashboard.

See [docs/protocol.md](docs/protocol.md).

MIT.
