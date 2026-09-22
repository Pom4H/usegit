import test from 'node:test';
import assert from 'node:assert/strict';
import { latestRevisionPerChange, replayState } from '../src/report.mjs';

function sample(sha, changeId, decision) {
  return {
    sha,
    metadata: { changeId, decision, granularity: 'dynamic' },
    stats: { files: 1, lines: 1 },
  };
}

test('multiple SHAs for one conceptual change count as one sample', () => {
  const newestFirst = [
    sample('new-a', 'UG-1', 'accepted'),
    sample('b', 'UG-2', 'pending'),
    sample('old-a', 'UG-1', 'pending'),
  ];

  const unique = latestRevisionPerChange(newestFirst);
  assert.equal(unique.length, 2);
  assert.equal(unique.find((x) => x.metadata.changeId === 'UG-1').sha, 'new-a');
  assert.equal(unique.find((x) => x.metadata.changeId === 'UG-1').metadata.decision, 'accepted');
});

test('replay completion requires repetitions for every strategy and task', () => {
  const experiments = [{
    id: 'EXP-0002',
    minimumSamplesPerVariant: 3,
    controlledBenchmark: {
      id: 'granularity-v1',
      taskIds: ['reconstruct', 'continue'],
      repetitionsPerTask: 2,
      targetTree: 'tree',
      branches: { A: 'a', B: 'b', C: 'c' },
      results: [
        { strategy: 'coarse', task: 'reconstruct' },
        { strategy: 'coarse', task: 'reconstruct' }
      ],
    },
  }];
  const strategies = {
    coarse: { samples: 3 },
    fine: { samples: 3 },
    dynamic: { samples: 3 },
  };

  const state = replayState(experiments, strategies);
  assert.equal(state.requiredRuns, 12);
  assert.equal(state.completedRuns, 2);
  assert.equal(state.completedMatrix.coarse.reconstruct, 2);
  assert.equal(state.completedMatrix.coarse.continue, 0);
  assert.equal(state.complete, false);
});
