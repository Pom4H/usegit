import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));

function run(command, cwd) {
  return execFileSync(process.execPath, [cli, ...command], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, USEGIT_AGENT_ID: 'agent-a' },
  }).trim();
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

test('WORK state survives process boundaries entirely inside Git refs', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'usegit-work-'));
  git(['init', '-q'], cwd);
  git(['config', 'user.name', 'test'], cwd);
  git(['config', 'user.email', 'test@example.com'], cwd);
  fs.writeFileSync(path.join(cwd, 'app.txt'), 'baseline\n');
  git(['add', 'app.txt'], cwd);
  git(['commit', '-qm', 'baseline'], cwd);

  const started = JSON.parse(run([
    'start',
    '--id', 'WORK-TEST',
    '--goal', 'prove durable state',
    '--hypothesis', 'refs survive process exit',
  ], cwd));
  assert.equal(started.status, 'active');
  assert.equal(started.durability, 'local');

  const stored = JSON.parse(git(['show', 'refs/usegit/work/WORK-TEST:work.json'], cwd));
  assert.equal(stored.goal, 'prove durable state');

  const waiting = JSON.parse(run([
    'await', 'WORK-TEST',
    '--event', 'ci:test',
    '--on-success', 'finish validation',
    '--on-failure', 'inspect failure',
  ], cwd));
  assert.equal(waiting.status, 'awaiting');
  assert.equal(waiting.lease, null);

  const status = JSON.parse(run(['status'], cwd));
  assert.equal(status.awaiting[0].id, 'WORK-TEST');

  const resumed = JSON.parse(execFileSync(process.execPath, [
    cli,
    'resume', 'WORK-TEST',
    '--owner', 'agent-b',
    '--result', 'success',
    '--evidence', 'CI passed',
  ], { cwd, encoding: 'utf8' }).trim());
  assert.equal(resumed.lease.owner, 'agent-b');
  assert.equal(resumed.selectedContinuation, 'finish validation');

  const finished = JSON.parse(execFileSync(process.execPath, [
    cli,
    'finish', 'WORK-TEST',
    '--owner', 'agent-b',
    '--decision', 'accepted',
    '--summary', 'resume worked',
  ], { cwd, encoding: 'utf8' }).trim());
  assert.equal(finished.status, 'accepted');

  const commits = git(['rev-list', '--count', 'refs/usegit/work/WORK-TEST'], cwd);
  assert.equal(commits, '4');
});
