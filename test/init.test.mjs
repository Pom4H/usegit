import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeRepository, AGENT_START, AGENT_END } from '../src/init.mjs';

function run(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

test('init only manages agent coordination instructions', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'usegit-init-'));
  try {
    run(cwd, ['init', '-q']);
    writeFileSync(path.join(cwd, 'AGENTS.md'), '# Existing rules\n\nKeep this text.\n');

    const first = initializeRepository(cwd, { toolRef: 'v1' });
    const agents = readFileSync(path.join(cwd, 'AGENTS.md'), 'utf8');

    assert.match(agents, /Keep this text\./);
    assert.ok(agents.includes(AGENT_START));
    assert.ok(agents.includes(AGENT_END));
    assert.match(agents, /claim-next/);
    assert.match(agents, /does not prescribe commit messages/);
    assert.deepEqual(Object.keys(first.files), ['agents']);

    const second = initializeRepository(cwd, { toolRef: 'v1' });
    assert.equal(readFileSync(path.join(cwd, 'AGENTS.md'), 'utf8'), agents);
    assert.equal(second.files.agents, 'unchanged');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
