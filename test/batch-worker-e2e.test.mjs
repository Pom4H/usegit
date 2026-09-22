import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function run(args, cwd, owner = 'control') {
  return JSON.parse(execFileSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, USEGIT_AGENT_ID: owner },
  }).trim());
}

test('control batches work and stateless workers claim compatible tasks without assignment', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'usegit-batch-'));
  git(['init', '-q'], cwd);
  git(['config', 'user.name', 'test'], cwd);
  git(['config', 'user.email', 'test@example.com'], cwd);
  fs.writeFileSync(path.join(cwd, 'baseline.txt'), 'x\n');
  git(['add', '.'], cwd);
  git(['commit', '-qm', 'baseline'], cwd);

  const plan = {
    id: 'BATCH-E2E',
    experiment: 'EXP-E2E',
    defaults: {
      uncertainty: 'low',
      oracle: 'objective',
      evidencePlan: 'deterministic test',
    },
    work: [
      {
        id: 'WORK-A',
        goal: 'A',
        hypothesis: 'A',
        scopes: ['src/a/**'],
        resources: [{ name: 'system.a', access: 'write' }],
        success: 'A passes',
        priority: 30,
      },
      {
        id: 'WORK-B',
        goal: 'B',
        hypothesis: 'B',
        scopes: ['src/a/file.ts'],
        resources: [{ name: 'system.a', access: 'read' }],
        success: 'B passes',
        priority: 20,
      },
      {
        id: 'WORK-C',
        goal: 'C',
        hypothesis: 'C',
        scopes: ['src/c/**'],
        resources: [{ name: 'system.c', access: 'write' }],
        success: 'C passes',
        priority: 10,
      },
    ],
  };
  fs.writeFileSync(path.join(cwd, 'batch.json'), JSON.stringify(plan));

  const batch = run(['batch', 'batch.json'], cwd);
  assert.deepEqual(batch.created, ['WORK-A', 'WORK-B', 'WORK-C']);
  assert.deepEqual(batch.queue.workerReady.map((x) => x.id), ['WORK-A', 'WORK-C']);
  assert.deepEqual(batch.queue.queueBlocked.map((x) => x.id), ['WORK-B']);

  const first = run(['claim-next'], cwd, 'instant-1');
  assert.equal(first.claimed.id, 'WORK-A');
  assert.equal(first.claimed.lease.owner, 'instant-1');

  const second = run(['claim-next'], cwd, 'instant-2');
  assert.equal(second.claimed.id, 'WORK-C');
  assert.equal(second.claimed.lease.owner, 'instant-2');

  const none = run(['claim-next'], cwd, 'instant-3');
  assert.equal(none.claimed, null);
  assert.equal(none.queueBlocked[0].id, 'WORK-B');

  run([
    'evidence', 'WORK-A',
    '--kind', 'observed',
    '--source', 'test:worker-a',
    '--result', 'success',
    '--observation', 'A deterministic check passed',
  ], cwd, 'instant-1');
  run(['finish', 'WORK-A', '--decision', 'accepted'], cwd, 'instant-1');

  const third = run(['claim-next'], cwd, 'instant-3');
  assert.equal(third.claimed.id, 'WORK-B');

  const rerun = run(['batch', 'batch.json'], cwd);
  assert.deepEqual(rerun.created, []);
  assert.deepEqual(rerun.skipped, ['WORK-A', 'WORK-B', 'WORK-C']);
});
