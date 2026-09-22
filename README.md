# usegit

Git-native coordination for coding agents.

usegit stores WORK state in Git refs so agents can claim work, hand it off, wait for CI, resume in a fresh process, and reject stale evidence.

## Start

```bash
npx --yes github:Pom4H/usegit#main init
usegit status
```

Take ownership now:

```bash
usegit start --goal "fix renderer race"
```

Queue work for any agent:

```bash
usegit enqueue --goal "add cache invalidation" --scope "src/cache/**" --resource-write "cache.protocol"
usegit claim-next
```

Persist an external wait:

```bash
usegit await WORK-1234 --event ci:test --on-success "finish" --on-failure "inspect failure"
```

A later agent can resume from Git alone:

```bash
usegit resume WORK-1234 --result success --evidence "CI passed" --evidence-kind observed --evidence-source "github-actions:412"
```

Acceptance requires observed or attested evidence for the exact current Git tree.

State lives only in `refs/usegit/work/*`. No database, prompt cache, experiment framework, commit-trailer protocol or dashboard.

See [docs/protocol.md](docs/protocol.md).

MIT.
