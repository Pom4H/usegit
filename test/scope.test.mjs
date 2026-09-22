import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScopes, scopesOverlap, workConflicts } from '../src/scope.mjs';

test('scopes normalize deterministically', () => {
  assert.deepEqual(normalizeScopes(['./src/**', 'test/a.mjs', 'src/**']), ['src/**', 'test/a.mjs']);
});

test('subtree and exact path overlap is detected without sibling false positives', () => {
  assert.equal(scopesOverlap('src/**', 'src/work.mjs'), true);
  assert.equal(scopesOverlap('src/work.mjs', 'src/work.mjs'), true);
  assert.equal(scopesOverlap('src/a/**', 'src/b/**'), false);
  assert.equal(scopesOverlap('**', 'docs/protocol.md'), true);
});

test('only concurrent active work produces compact conflicts', () => {
  const rows = [
    { id: 'WORK-A', status: 'active', scopes: ['src/**'] },
    { id: 'WORK-B', status: 'active', scopes: ['src/work.mjs', 'test/**'] },
    { id: 'WORK-C', status: 'awaiting', scopes: ['src/**'] },
  ];
  assert.deepEqual(workConflicts(rows), [{
    work: ['WORK-A', 'WORK-B'],
    reason: 'scope-overlap',
    overlaps: [['src/**', 'src/work.mjs']],
  }]);
});

test('undeclared active scope is surfaced as uncertainty instead of assumed safe', () => {
  const conflicts = workConflicts([
    { id: 'WORK-A', status: 'active', scopes: [] },
    { id: 'WORK-B', status: 'active', scopes: ['docs/**'] },
  ]);
  assert.equal(conflicts[0].reason, 'undeclared-scope');
});
