import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));

function run(command, cwd, owner = 'agent-a') {
  return execFileSync(process.execPath, [cli, ...command], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, USEGIT_AGENT_ID: owner },
  }).trim();
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

test('WORK state survives process boundaries with ordinary project commits', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'usegit-work-'));
  git(['init', '-q'], cwd);
  git(['config', 'user.name', 'test'], cwd);
  git(['config', 'user.email', 'test@example.com'], cwd);
  fs.writeFileSync(path.join(cwd, 'app.txt'), 'baseline\n');
  git(['add', 'app.txt'], cwd);
  git(['commit', '-qm', 'fix stuff'], cwd);

  const started = JSON.parse(run([
    'start',
    '--id', 'WORK-TEST',
    '--goal', 'prove durable state',
  ], cwd));

  assert.equal(started.status, 'active');
  assert.equal(started.durability, 'local');

  const stored = JSON.parse(git(['show', 'refs/usegit/work/WORK-TEST:work.json'], cwd));
  assert.equal(stored.goal, 'prove durable state');
  assert.equal('hypothesis' in stored, false);
  assert.equal('route' in stored, false);
  assert.equal(stored.baseTree, git(['rev-parse', 'HEAD^{tree}'], cwd));

  const waiting = JSON.parse(run([
    'await', 'WORK-TEST',
    '--event', 'ci:test',
    '--on-success', 'finish validation',
    '--on-failure', 'inspect failure',
  ], cwd));
  assert.equal(waiting.status, 'awaiting');

  const status = JSON.parse(run(['status'], cwd));
  assert.equal(status.awaiting[0].id, 'WORK-TEST');

  const resumed = JSON.parse(run([
    'resume', 'WORK-TEST',
    '--owner', 'agent-b',
    '--result', 'success',
    '--evidence', 'CI passed',
    '--evidence-kind', 'observed',
    '--evidence-source', 'test:ci',
  ], cwd, 'agent-b'));
  assert.equal(resumed.lease.owner, 'agent-b');

  const finished = JSON.parse(run([
    'finish', 'WORK-TEST',
    '--owner', 'agent-b',
    '--decision', 'accepted',
  ], cwd, 'agent-b'));
  assert.equal(finished.status, 'accepted');
});
