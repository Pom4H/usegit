import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePlan } from '../src/granularity.mjs';

test('keeps implementation and its test together when they prove one causal claim', () => {
  const result = evaluatePlan({ changes: [
    { path: 'src/parser.mjs', causalUnit: 'parse-trailers', lines: 80 },
    { path: 'test/parser.test.mjs', causalUnit: 'parse-trailers', lines: 45 },
  ] });
  assert.equal(result.recommendation, 'keep');
});

test('splits independently falsifiable changes regardless of total size', () => {
  const result = evaluatePlan({ changes: [
    { path: 'src/parser.mjs', causalUnit: 'parse-trailers', lines: 8 },
    { path: 'src/report.mjs', causalUnit: 'rank-policies', lines: 7 },
  ] });
  assert.equal(result.recommendation, 'split');
});

test('does not pretend to know a boundary when causal attribution is missing', () => {
  const result = evaluatePlan({ changes: [{ path: 'README.md', lines: 4 }] });
  assert.equal(result.recommendation, 'clarify');
});
