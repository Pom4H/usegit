import test from 'node:test';
import assert from 'node:assert/strict';
import {
  environmentFingerprint,
  normalizeEvidence,
  supportingEvidenceForTree,
} from '../src/evidence.mjs';

test('trusted evidence requires source and exact tree', () => {
  assert.throws(() => normalizeEvidence({
    kind: 'observed',
    result: 'success',
  }), /requires a source/);

  assert.throws(() => normalizeEvidence({
    kind: 'observed',
    source: 'ci:1',
    result: 'success',
  }), /requires an exact Git tree/);
});

test('environment fingerprint is stable across key order', () => {
  assert.equal(
    environmentFingerprint({ b: 2, a: 1 }),
    environmentFingerprint({ a: 1, b: 2 }),
  );
});

test('acceptance evidence must be trusted, positive and tree-exact', () => {
  const evidence = [
    normalizeEvidence({
      kind: 'asserted',
      result: 'success',
      tree: 'tree-a',
    }),
    normalizeEvidence({
      kind: 'observed',
      result: 'failure',
      source: 'ci:1',
      tree: 'tree-a',
    }),
    normalizeEvidence({
      kind: 'observed',
      result: 'success',
      source: 'ci:2',
      tree: 'tree-b',
    }),
    normalizeEvidence({
      kind: 'attested',
      result: 'success',
      source: 'human:review',
      tree: 'tree-a',
    }),
  ];

  const supporting = supportingEvidenceForTree(evidence, 'tree-a');
  assert.equal(supporting.length, 1);
  assert.equal(supporting[0].kind, 'attested');
});
