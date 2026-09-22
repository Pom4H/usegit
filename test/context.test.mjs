import test from 'node:test';
import assert from 'node:assert/strict';
import { compactCausalHistory, criticalFieldRecall } from '../src/context.mjs';

const commits = [
  {
    sha: '1234567890abcdef',
    subject: 'newest',
    metadata: {
      changeId: 'UG-2',
      experiment: 'EXP-2',
      intent: 'compress-context',
      hypothesis: 'compact-is-enough',
      granularity: 'coarse',
      decision: 'pending',
      noisyField: 'drop-me',
    },
  },
  {
    sha: 'abcdef1234567890',
    subject: 'older',
    metadata: {
      changeId: 'UG-1',
      experiment: 'EXP-1',
      intent: 'bootstrap',
      hypothesis: 'history-helps',
      granularity: 'coarse',
      decision: 'accepted',
    },
  },
];

test('compact packet preserves every critical causal field', () => {
  const packet = compactCausalHistory(commits);
  assert.equal(criticalFieldRecall(commits, packet), 1);
  assert.equal(packet[0].noisyField, undefined);
});

test('compact packet obeys history limit', () => {
  assert.equal(compactCausalHistory(commits, 1).length, 1);
});
