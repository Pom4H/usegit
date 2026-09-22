import test from 'node:test';
import assert from 'node:assert/strict';
import { latestRevisionPerChange } from '../src/report.mjs';

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
