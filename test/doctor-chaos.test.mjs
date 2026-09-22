import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { doctorRepository } from '../src/doctor.mjs';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));

function git(args, cwd, input) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
  }).trim();
}

function init() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'usegit-chaos-'));
  git(['init', '-q'], cwd);
  git(['config', 'user.name', 'test'], cwd);
  git(['config', 'user.email', 'test@example.com'], cwd);
  fs.writeFileSync(path.join(cwd, 'app.txt'), 'baseline\n');
  git(['add', '.'], cwd);
  git(['commit', '-qm', 'plain commit'], cwd);
  return cwd;
}

function run(args, cwd, owner = 'agent-a') {
  return execFileSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, USEGIT_AGENT_ID: owner },
  }).trim();
}

function fail(args, cwd, owner = 'agent-a') {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, USEGIT_AGENT_ID: owner },
  });
}

function writeWorkRef(cwd, id, state) {
  const blob = git(['hash-object', '-w', '--stdin'], cwd, JSON.stringify(state));
  const tree = git(['mktree'], cwd, '100644 blob ' + blob + '\twork.json\n');
  const commit = git(['commit-tree', tree, '-m', 'chaos ' + id], cwd);
  git(['update-ref', 'refs/usegit/work/' + id, commit], cwd);
}

test('asserted evidence cannot accept work and trusted evidence becomes stale after code drift', () => {
  const cwd = init();
  run([
    'start', '--id', 'WORK-CHAOS',
    '--goal', 'prove acceptance provenance',
    '--scope', 'app.txt',
  ], cwd);

  run([
    'evidence', 'WORK-CHAOS',
    '--kind', 'asserted',
    '--result', 'success',
    '--observation', 'agent says pass',
  ], cwd);

  let result = fail(['finish', 'WORK-CHAOS', '--decision', 'accepted'], cwd);
  assert.notEqual(result.status, 0);

  run([
    'evidence', 'WORK-CHAOS',
    '--kind', 'observed',
    '--source', 'test:before-drift',
    '--result', 'success',
  ], cwd);

  fs.writeFileSync(path.join(cwd, 'app.txt'), 'changed\n');
  git(['add', '.'], cwd);
  git(['commit', '-qm', 'another ordinary commit'], cwd);

  result = fail(['finish', 'WORK-CHAOS', '--decision', 'accepted'], cwd);
  assert.notEqual(result.status, 0);

  run([
    'evidence', 'WORK-CHAOS',
    '--kind', 'observed',
    '--source', 'test:after-drift',
    '--result', 'success',
  ], cwd);

  const finished = JSON.parse(run([
    'finish', 'WORK-CHAOS',
    '--decision', 'accepted',
  ], cwd));
  assert.equal(finished.status, 'accepted');
});

test('doctor detects semantic collision across disjoint files', () => {
  const cwd = init();
  run([
    'start', '--id', 'WORK-A', '--goal', 'A',
    '--scope', 'a/**',
    '--resource-write', 'renderer.lighting',
  ], cwd, 'agent-a');
  run([
    'start', '--id', 'WORK-B', '--goal', 'B',
    '--scope', 'b/**',
    '--resource-read', 'renderer.lighting',
  ], cwd, 'agent-b');

  const diagnosis = doctorRepository({ cwd });
  assert.equal(diagnosis.healthy, false);
  assert.ok(diagnosis.errors.some((x) =>
    x.code === 'live-work-conflict' &&
    x.conflict?.reason === 'semantic-resource-overlap'));
});

test('doctor detects malformed active state instead of inventing repair', () => {
  const cwd = init();
  const base = git(['rev-parse', 'HEAD'], cwd);
  const tree = git(['rev-parse', 'HEAD^{tree}'], cwd);

  writeWorkRef(cwd, 'WORK-BROKEN', {
    schemaVersion: 3,
    id: 'WORK-BROKEN',
    goal: 'broken',
    base,
    baseTree: tree,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lease: null,
    evidence: [],
  });

  const diagnosis = doctorRepository({ cwd });
  assert.equal(diagnosis.healthy, false);
  assert.ok(diagnosis.errors.some((x) => x.code === 'active-missing-lease'));
  assert.deepEqual(diagnosis.repairsPerformed, []);
});
