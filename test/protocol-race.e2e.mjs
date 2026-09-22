import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function configure(cwd, name = 'test') {
  git(['config', 'user.name', name], cwd);
  git(['config', 'user.email', name + '@example.com'], cwd);
}

function run(args, cwd, owner) {
  return JSON.parse(execFileSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, USEGIT_AGENT_ID: owner },
  }).trim());
}

function runAsync(args, cwd, owner) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd,
      env: { ...process.env, USEGIT_AGENT_ID: owner },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({
      code,
      stdout,
      stderr,
      json: code === 0 && stdout.trim() ? JSON.parse(stdout) : null,
    }));
  });
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usegit-protocol-'));
  const seed = path.join(root, 'seed');
  const origin = path.join(root, 'origin.git');
  fs.mkdirSync(seed);

  git(['init', '-q', '-b', 'main'], seed);
  configure(seed, 'seed');
  fs.writeFileSync(path.join(seed, 'baseline.txt'), 'baseline\n');
  git(['add', '.'], seed);
  git(['commit', '-qm', 'normal agent commit'], seed);

  execFileSync('git', ['init', '--bare', '-q', origin], { cwd: root });
  git(['remote', 'add', 'origin', origin], seed);
  git(['push', '-q', '-u', 'origin', 'main'], seed);
  execFileSync('git', ['--git-dir', origin, 'symbolic-ref', 'HEAD', 'refs/heads/main']);

  const clones = {};
  for (const name of ['control', 'worker-a', 'worker-b', 'observer']) {
    const cwd = path.join(root, name);
    execFileSync('git', ['clone', '-q', origin, cwd], { cwd: root });
    configure(cwd, name);
    clones[name] = cwd;
  }
  return { root, origin, ...clones };
}

test('two independent workers racing claim-next produce one durable owner', async () => {
  const fx = fixture();

  run([
    'enqueue',
    '--id', 'WORK-RACE',
    '--goal', 'prove single-owner claim',
    '--scope', 'src/**',
  ], fx.control, 'control');

  const [a, b] = await Promise.all([
    runAsync(['claim-next', '--retries', '12'], fx['worker-a'], 'worker-a'),
    runAsync(['claim-next', '--retries', '12'], fx['worker-b'], 'worker-b'),
  ]);

  assert.equal(a.code, 0, a.stderr);
  assert.equal(b.code, 0, b.stderr);

  const claims = [a.json, b.json].filter((result) => result?.claimed?.id === 'WORK-RACE');
  assert.equal(claims.length, 1);

  git(['fetch', '-q', 'origin', '+refs/usegit/work/*:refs/usegit/work/*'], fx.observer);
  const remote = JSON.parse(git(['show', 'refs/usegit/work/WORK-RACE:work.json'], fx.observer));
  assert.equal(remote.status, 'active');
  assert.equal(remote.lease.owner, claims[0].claimed.lease.owner);
});

test('awaited WORK survives source-process loss and resumes in a zero-context clone', () => {
  const fx = fixture();

  run([
    'start',
    '--id', 'WORK-RECOVERY',
    '--goal', 'prove crash recovery',
  ], fx.control, 'source-agent');

  const waiting = run([
    'await',
    'WORK-RECOVERY',
    '--event', 'ci:recovery',
    '--on-success', 'finish from a fresh clone',
    '--on-failure', 'inspect persisted WORK',
  ], fx.control, 'source-agent');
  assert.equal(waiting.status, 'awaiting');

  fs.rmSync(fx.control, { recursive: true, force: true });

  const resumedPath = path.join(fx.root, 'resumed');
  execFileSync('git', ['clone', '-q', fx.origin, resumedPath], { cwd: fx.root });
  configure(resumedPath, 'resumed');

  const resumed = run([
    'resume',
    'WORK-RECOVERY',
    '--result', 'success',
    '--evidence', 'fresh clone reconstructed awaiting state',
    '--evidence-kind', 'observed',
    '--evidence-source', 'protocol:recovery',
  ], resumedPath, 'fresh-agent');

  assert.equal(resumed.status, 'active');
  assert.equal(resumed.lease.owner, 'fresh-agent');
  assert.equal(resumed.selectedContinuation, 'finish from a fresh clone');

  const finished = run([
    'finish',
    'WORK-RECOVERY',
    '--decision', 'accepted',
  ], resumedPath, 'fresh-agent');
  assert.equal(finished.status, 'accepted');
});
