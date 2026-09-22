import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeRepository, AGENT_START, AGENT_END } from '../src/init.mjs';
import { validationErrors } from '../src/metadata.mjs';

function run(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

test('init is idempotent and preserves repository-specific agent instructions', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'usegit-init-'));
  try {
    run(cwd, ['init', '-q']);
    writeFileSync(path.join(cwd, 'AGENTS.md'), '# Existing rules\n\nKeep this text.\n');

    const first = initializeRepository(cwd, { toolRef: 'v1' });
    const agentsAfterFirst = readFileSync(path.join(cwd, 'AGENTS.md'), 'utf8');
    const workflowAfterFirst = readFileSync(
      path.join(cwd, '.github', 'workflows', 'usegit-causal.yml'),
      'utf8',
    );
    const config = JSON.parse(readFileSync(path.join(cwd, '.usegit', 'config.json'), 'utf8'));

    assert.match(agentsAfterFirst, /Keep this text\./);
    assert.ok(agentsAfterFirst.includes(AGENT_START));
    assert.ok(agentsAfterFirst.includes(AGENT_END));
    assert.match(agentsAfterFirst, /WORK-\*/);\n    assert.match(agentsAfterFirst, /claim-next/);
    assert.match(agentsAfterFirst, /await WORK-\*/);
    assert.match(agentsAfterFirst, /Pull requests are integration boundaries/);
    assert.match(workflowAfterFirst, /reusable\.yml@v1/);
    assert.equal(config.tool.ref, 'v1');
    assert.equal(config.workRefPrefix, 'refs/usegit/work/');
    assert.equal(first.files.batchExample, 'created');
    assert.ok(readFileSync(path.join(cwd, '.usegit', 'batch.example.json'), 'utf8').includes('BATCH-example'));
    assert.equal(run(cwd, ['config', '--get', 'notes.rewriteRef']), 'refs/notes/usegit');

    const second = initializeRepository(cwd, { toolRef: 'v1' });
    assert.equal(readFileSync(path.join(cwd, 'AGENTS.md'), 'utf8'), agentsAfterFirst);
    assert.equal(
      readFileSync(path.join(cwd, '.github', 'workflows', 'usegit-causal.yml'), 'utf8'),
      workflowAfterFirst,
    );
    assert.equal(first.root, second.root);
    assert.equal(second.files.agents, 'unchanged');
    assert.equal(second.files.workflow, 'unchanged');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('bootstrap boundary exempts only the adoption commit', () => {
  const bootstrap = {
    sha: 'bootstrap',
    parents: ['legacy'],
    metadata: {},
  };
  assert.deepEqual(validationErrors([bootstrap], { bootstrapSha: 'bootstrap' }), []);

  const later = {
    sha: 'later',
    parents: ['bootstrap'],
    metadata: {},
  };
  const errors = validationErrors([later, bootstrap], { bootstrapSha: 'bootstrap' });
  assert.equal(errors.length, 6);
  assert.ok(errors.every((error) => error.startsWith('later missing Usegit-')));
});

test('structured commits after bootstrap validate normally', () => {
  const bootstrap = { sha: 'bootstrap', parents: ['legacy'], metadata: {} };
  const later = {
    sha: 'later',
    parents: ['bootstrap'],
    metadata: {
      changeId: 'UG-1',
      experiment: 'EXP-1',
      intent: 'adopt',
      hypothesis: 'history-helps',
      granularity: 'dynamic',
      decision: 'pending',
    },
  };

  assert.deepEqual(validationErrors([later, bootstrap], { bootstrapSha: 'bootstrap' }), []);
});
