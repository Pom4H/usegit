import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { initializeRepository, AGENT_START, AGENT_END } from '../src/init.mjs';
function git(cwd, args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim(); }
test('init is small and idempotent', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'usegit-init-'));
  try {
    git(cwd, ['init', '-q']); writeFileSync(path.join(cwd, 'AGENTS.md'), '# Existing\n\nKeep me.\n');
    const first = initializeRepository(cwd, { toolRef: 'v1' });
    const agents = readFileSync(path.join(cwd, 'AGENTS.md'), 'utf8');
    const config = JSON.parse(readFileSync(path.join(cwd, '.usegit', 'config.json'), 'utf8'));
    assert.match(agents, /Keep me/); assert.ok(agents.includes(AGENT_START)); assert.ok(agents.includes(AGENT_END)); assert.match(agents, /claim-next/);
    assert.equal(config.workRefPrefix, 'refs/usegit/work/'); assert.equal(config.tool.ref, 'v1'); assert.equal(config.notesRef, undefined);
    assert.equal(first.files.batchExample, 'created');
    const second = initializeRepository(cwd, { toolRef: 'v1' }); assert.equal(second.files.agents, 'unchanged'); assert.equal(second.files.config, 'unchanged');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
