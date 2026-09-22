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

test('requires paired replay after observational samples are sufficient', () => {
  const next = nextExperiment({
    ...base,
    strategies: {
      coarse: { samples: 3 },
      fine: { samples: 3 },
      dynamic: { samples: 4 },
    },
    granularityReplay: {
      benchmarkId: 'granularity-v1',
      sampleReady: true,
      requiredRunsPerVariant: 3,
      completedRuns: { coarse: 0, fine: 0, dynamic: 0 },
      complete: false,
    },
  });

  assert.equal(next.kind, 'run-controlled-granularity-replay');
  assert.deepEqual(next.strategies, ['coarse', 'fine', 'dynamic']);
});
