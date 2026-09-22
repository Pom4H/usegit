import test from 'node:test';
import assert from 'node:assert/strict';
import { findRepeatedFalsifiedHypotheses } from '../src/negative.mjs';

function commit(sha, hypothesis, decision, conditionsChanged) {
  return { sha, metadata: { hypothesis, decision, conditionsChanged } };
}

test('flags work that repeats a falsified hypothesis under unchanged conditions', () => {
  const commitsNewestFirst = [
    commit('b', 'half-res-is-equivalent', 'pending'),
    commit('a', 'half-res-is-equivalent', 'falsified'),
  ];
  const repeated = findRepeatedFalsifiedHypotheses(commitsNewestFirst);
  assert.equal(repeated.length, 1);
  assert.equal(repeated[0].falsifiedAt, 'a');
  assert.equal(repeated[0].repeatedAt, 'b');
});

test('allows a falsified hypothesis to be revisited when conditions changed', () => {
  const commitsNewestFirst = [
    commit('b', 'half-res-is-equivalent', 'pending', 'true'),
    commit('a', 'half-res-is-equivalent', 'falsified'),
  ];
  assert.deepEqual(findRepeatedFalsifiedHypotheses(commitsNewestFirst), []);
});

test('does not flag the falsification event itself', () => {
  const commitsNewestFirst = [
    commit('b', 'half-res-is-equivalent', 'falsified'),
    commit('a', 'half-res-is-equivalent', 'falsified'),
  ];
  assert.deepEqual(findRepeatedFalsifiedHypotheses(commitsNewestFirst), []);
});
