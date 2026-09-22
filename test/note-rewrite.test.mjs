import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { configureRepository } from '../src/setup.mjs';

function run(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

test('usegit evidence note follows an amended SHA when rewrite support is configured', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'usegit-note-rewrite-'));
  try {
    run(cwd, ['init', '-q']);
    run(cwd, ['config', 'user.name', 'test']);
    run(cwd, ['config', 'user.email', 'test@example.com']);

    writeFileSync(path.join(cwd, 'a.txt'), 'a\n');
    run(cwd, ['add', 'a.txt']);
    run(cwd, ['commit', '-q', '-m', 'first']);
    const oldSha = run(cwd, ['rev-parse', 'HEAD']);
    run(cwd, ['notes', '--ref=usegit', 'add', '-m', '{"evidence":"passed"}', oldSha]);

    const configured = configureRepository(cwd);
    assert.equal(configured.notesRewriteRef, 'refs/notes/usegit');

    appendFileSync(path.join(cwd, 'a.txt'), 'b\n');
    run(cwd, ['add', 'a.txt']);
    run(cwd, ['commit', '--amend', '-q', '--no-edit']);
    const newSha = run(cwd, ['rev-parse', 'HEAD']);

    assert.notEqual(newSha, oldSha);
    assert.equal(run(cwd, ['notes', '--ref=usegit', 'show', newSha]), '{"evidence":"passed"}');
    assert.equal(run(cwd, ['notes', '--ref=usegit', 'show', oldSha]), '{"evidence":"passed"}');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
