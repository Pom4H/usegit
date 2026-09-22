import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBatchPlan } from '../src/batch.mjs';

test('batch contains coordination fields only', () => {
  const batch = normalizeBatchPlan({
    id: 'BATCH-1',
    defaults: {
      resources: [{ name: 'metric.quality', access: 'read' }],
    },
    work: [{
      id: 'WORK-A',
      goal: 'improve A',
      scopes: ['src/a/**'],
      priority: 7,
    }],
  });

  assert.equal(batch.id, 'BATCH-1');
  assert.equal(batch.schemaVersion, 2);
  assert.equal(batch.work[0].goal, 'improve A');
  assert.equal(batch.work[0].priority, 7);
  assert.deepEqual(batch.work[0].resources, [{ name: 'metric.quality', access: 'read' }]);
  assert.equal('hypothesis' in batch.work[0], false);
  assert.equal('experiment' in batch, false);
  assert.equal('routing' in batch.work[0], false);
});

test('batch rejects duplicate ids before mutating Git', () => {
  assert.throws(() => normalizeBatchPlan({
    id: 'BATCH-1',
    work: [
      { id: 'WORK-A', goal: 'a' },
      { id: 'WORK-A', goal: 'b' },
    ],
  }), /duplicate work id/);
});
