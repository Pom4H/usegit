import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBatchPlan } from '../src/batch.mjs';

test('batch defaults expand into deterministic worker specifications', () => {
  const batch = normalizeBatchPlan({
    id: 'BATCH-1',
    experiment: 'EXP-1',
    defaults: {
      uncertainty: 'low',
      oracle: 'objective',
      evidencePlan: 'CI',
      resources: [{ name: 'metric.quality', access: 'read' }],
    },
    work: [{
      id: 'WORK-A',
      goal: 'improve A',
      hypothesis: 'A improves',
      scopes: ['src/a/**'],
      success: 'metric improves',
      priority: 7,
    }],
  });

  assert.equal(batch.id, 'BATCH-1');
  assert.equal(batch.work[0].experiment, 'EXP-1');
  assert.equal(batch.work[0].routing.uncertainty, 'low');
  assert.equal(batch.work[0].routing.oracle, 'objective');
  assert.equal(batch.work[0].contract.evidence, 'CI');
  assert.equal(batch.work[0].priority, 7);
  assert.deepEqual(batch.work[0].resources, [{ name: 'metric.quality', access: 'read' }]);
});

test('batch rejects duplicate ids before mutating Git', () => {
  assert.throws(() => normalizeBatchPlan({
    id: 'BATCH-1',
    work: [
      { id: 'WORK-A', goal: 'a', hypothesis: 'a' },
      { id: 'WORK-A', goal: 'b', hypothesis: 'b' },
    ],
  }), /duplicate work id/);
});
