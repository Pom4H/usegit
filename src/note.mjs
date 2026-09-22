import { environmentSnapshot, normalizeEvidence } from './evidence.mjs';
import { commitStats, git } from './git.mjs';
import { parseTrailers } from './metadata.mjs';

const sha = process.argv[2] ?? git(['rev-parse', 'HEAD']);
const status = process.argv[3] ?? 'unknown';
const message = git(['show', '-s', '--format=%B', sha]);
const metadata = parseTrailers(message);
const tree = git(['rev-parse', `${sha}^{tree}`]);
const environment = environmentSnapshot();

const evidence = normalizeEvidence({
  kind: 'observed',
  result: status === 'success' ? 'success' : status,
  observation: 'usegit causal validation workflow',
  source: process.env.GITHUB_RUN_ID
    ? `github-actions:${process.env.GITHUB_RUN_ID}`
    : 'usegit-ci',
  commit: sha,
  tree,
  environment,
});

const note = {
  schemaVersion: 2,
  sha,
  tree,
  observedBy: 'usegit-ci',
  metadata,
  stats: commitStats(sha),
  evidence,
  ci: {
    status,
    runId: process.env.GITHUB_RUN_ID ?? null,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    workflow: process.env.GITHUB_WORKFLOW ?? null,
  },
};

const encoded = JSON.stringify(note);
git(['notes', '--ref=usegit', 'add', '-f', '-m', encoded, sha]);
process.stdout.write(`${JSON.stringify(note, null, 2)}\n`);
