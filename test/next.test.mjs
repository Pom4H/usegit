import test from 'node:test';
import assert from 'node:assert/strict';
import { nextExperiment } from '../src/next.mjs';

const base = {
  validationErrors: [],
  unresolvedExperiments: ['EXP-0001', 'EXP-0002'],
  granularityReplay: null,
  strategies: {
    coarse: { samples: 1 },
    fine: { samples: 0 },
    dynamic: { samples: 0 },
  },
};

test('equal evidence preserves declared experimental order instead of lexical bias', () => {
  const next = nextExperiment(base);
  assert.equal(next.kind, 'collect-granularity-evidence');
  assert.equal(next.strategy, 'fine');
});

test('least-sampled strategy wins over declared order', () => {
  const next = nextExperiment({
    ...base,
    strategies: {
      coarse: { samples: 3 },
      fine: { samples: 3 },
      dynamic: { samples: 1 },
    },
  });
  assert.equal(next.strategy, 'dynamic');
});

test('does not compare policies before minimum evidence exists', () => {
  const next = nextExperiment({
    ...base,
    strategies: {
      coarse: { samples: 3 },
      fine: { samples: 2 },
      dynamic: { samples: 3 },
    },
  });
  assert.equal(next.strategy, 'fine');
});

test('requires every strategy/task cell to be independently replicated', () => {
  const next = nextExperiment({
    ...base,
    strategies: {
      coarse: { samples: 3 },
      fine: { samples: 3 },
      dynamic: { samples: 5 },
    },
    granularityReplay: {
      benchmarkId: 'granularity-v1',
      sampleReady: true,
      repetitionsPerTask: 3,
      completedMatrix: {
        coarse: { 'reconstruct-causal-units': 3, 'rollback-interface': 2, 'rollback-measurement': 3 },
        fine: { 'reconstruct-causal-units': 3, 'rollback-interface': 3, 'rollback-measurement': 3 },
        dynamic: { 'reconstruct-causal-units': 3, 'rollback-interface': 3, 'rollback-measurement': 3 },
      },
      completedRuns: 26,
      requiredRuns: 27,
      complete: false,
    },
  });

  assert.equal(next.kind, 'run-controlled-granularity-replay');
  assert.deepEqual(next.assignments, [
    { strategy: 'coarse', task: 'rollback-interface', remaining: 1 },
  ]);
  assert.match(next.reason, /26\/27/);
});
