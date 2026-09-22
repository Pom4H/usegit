import test from 'node:test';
import assert from 'node:assert/strict';
import { decideIntegration } from '../src/integration.mjs';

function accepted(ids) {
  return ids.map((id) => ({ id, status: 'accepted' }));
}

test('accepted compatible work does not create one PR per work item', () => {
  const decision = decideIntegration({
    work: accepted(['WORK-1', 'WORK-2', 'WORK-3']),
  });

  assert.equal(decision.kind, 'direct-merge');
  assert.equal(decision.naivePrCount, 3);
  assert.equal(decision.recommendedPrCount, 0);
  assert.equal(decision.prReductionRatio, 1);
});

test('a real boundary creates one PR for the whole integration set', () => {
  const decision = decideIntegration({
    work: accepted(['WORK-1', 'WORK-2', 'WORK-3', 'WORK-4', 'WORK-5']),
    boundaries: { humanReview: true },
  });

  assert.equal(decision.kind, 'pr');
  assert.equal(decision.naivePrCount, 5);
  assert.equal(decision.recommendedPrCount, 1);
  assert.equal(decision.prReductionRatio, 0.8);
  assert.deepEqual(decision.boundaryReasons, ['human-review']);
});

test('unfinished work delays integration instead of opening placeholder PRs', () => {
  const decision = decideIntegration({
    work: [
      { id: 'WORK-1', status: 'accepted' },
      { id: 'WORK-2', status: 'awaiting-evidence' },
    ],
  });

  assert.equal(decision.kind, 'wait');
  assert.deepEqual(decision.unfinished, ['WORK-2']);
  assert.equal(decision.recommendedPrCount, 0);
});

test('conflicts are resolved before deciding whether a PR exists', () => {
  const decision = decideIntegration({
    work: accepted(['WORK-1', 'WORK-2']),
    conflicts: [{ left: 'WORK-1', right: 'WORK-2', reason: 'same renderer state' }],
  });

  assert.equal(decision.kind, 'resolve-conflicts');
  assert.equal(decision.recommendedPrCount, 0);
});
