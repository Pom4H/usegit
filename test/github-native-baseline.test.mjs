import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function configure(cwd, name) {
  git(['config', 'user.name', name], cwd);
  git(['config', 'user.email', name + '@example.com'], cwd);
}

function pushAsync(args, cwd) {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usegit-github-native-'));
  const seed = path.join(root, 'seed');
  const origin = path.join(root, 'origin.git');
  fs.mkdirSync(seed);

  git(['init', '-q', '-b', 'main'], seed);
  configure(seed, 'seed');
  fs.writeFileSync(path.join(seed, 'file.txt'), 'baseline\n');
  git(['add', '.'], seed);
  git(['commit', '-qm', 'baseline'], seed);
  const base = git(['rev-parse', 'HEAD'], seed);

  execFileSync('git', ['init', '--bare', '-q', origin], { cwd: root });
  git(['remote', 'add', 'origin', origin], seed);
  git(['push', '-q', '-u', 'origin', 'main'], seed);
  execFileSync('git', ['--git-dir', origin, 'symbolic-ref', 'HEAD', 'refs/heads/main']);

  const clones = {};
  for (const name of ['agent-a', 'agent-b']) {
    const cwd = path.join(root, name);
    execFileSync('git', ['clone', '-q', origin, cwd], { cwd: root });
    configure(cwd, name);
    clones[name] = cwd;
  }

  return { root, origin, base, ...clones };
}

test('ordinary Git branch creation can be an exclusive claim CAS', async () => {
  const fx = fixture();
  const claimRef = 'refs/heads/claim/WORK-1';

  for (const name of ['agent-a', 'agent-b']) {
    const cwd = fx[name];
    git(['commit', '--allow-empty', '-qm', 'claim ' + name], cwd);
  }

  const claimA = git(['rev-parse', 'HEAD'], fx['agent-a']);
  const claimB = git(['rev-parse', 'HEAD'], fx['agent-b']);
  assert.notEqual(claimA, claimB);

  const [a, b] = await Promise.all([
    pushAsync(['push', 'origin', 'HEAD:' + claimRef], fx['agent-a']),
    pushAsync(['push', 'origin', 'HEAD:' + claimRef], fx['agent-b']),
  ]);

  const winners = [a, b].filter((result) => result.code === 0);
  const losers = [a, b].filter((result) => result.code !== 0);
  assert.equal(winners.length, 1, JSON.stringify({ a, b }, null, 2));
  assert.equal(losers.length, 1, JSON.stringify({ a, b }, null, 2));

  const remoteWinner = execFileSync(
    'git',
    ['--git-dir', fx.origin, 'rev-parse', claimRef],
    { encoding: 'utf8' },
  ).trim();
  assert.ok([claimA, claimB].includes(remoteWinner));
});

test('ordinary Git force-with-lease gives exclusive stale-claim takeover', async () => {
  const fx = fixture();
  const claimRef = 'refs/heads/claim/WORK-2';

  git(['commit', '--allow-empty', '-qm', 'initial claim'], fx['agent-a']);
  git(['push', '-q', 'origin', 'HEAD:' + claimRef], fx['agent-a']);

  const old = execFileSync(
    'git',
    ['--git-dir', fx.origin, 'rev-parse', claimRef],
    { encoding: 'utf8' },
  ).trim();

  for (const name of ['agent-a', 'agent-b']) {
    const cwd = fx[name];
    git(['fetch', '-q', 'origin', claimRef + ':' + claimRef], cwd);
    git(['checkout', '-q', '--detach', claimRef], cwd);
    git(['commit', '--allow-empty', '-qm', 'reclaim ' + name], cwd);
  }

  const nextA = git(['rev-parse', 'HEAD'], fx['agent-a']);
  const nextB = git(['rev-parse', 'HEAD'], fx['agent-b']);
  assert.notEqual(nextA, nextB);

  const leaseArg = '--force-with-lease=' + claimRef + ':' + old;
  const [a, b] = await Promise.all([
    pushAsync(['push', leaseArg, 'origin', 'HEAD:' + claimRef], fx['agent-a']),
    pushAsync(['push', leaseArg, 'origin', 'HEAD:' + claimRef], fx['agent-b']),
  ]);

  const winners = [a, b].filter((result) => result.code === 0);
  const losers = [a, b].filter((result) => result.code !== 0);
  assert.equal(winners.length, 1, JSON.stringify({ a, b }, null, 2));
  assert.equal(losers.length, 1, JSON.stringify({ a, b }, null, 2));

  const remoteWinner = execFileSync(
    'git',
    ['--git-dir', fx.origin, 'rev-parse', claimRef],
    { encoding: 'utf8' },
  ).trim();
  assert.ok([nextA, nextB].includes(remoteWinner));
});
