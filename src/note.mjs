import { commitStats, git } from './git.mjs';
import { parseTrailers } from './metadata.mjs';

const sha = process.argv[2] ?? git(['rev-parse', 'HEAD']);
const status = process.argv[3] ?? 'unknown';
const message = git(['show', '-s', '--format=%B', sha]);
const metadata = parseTrailers(message);

const note = {
  schemaVersion: 1,
  sha,
  observedBy: 'usegit-ci',
  metadata,
  stats: commitStats(sha),
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
