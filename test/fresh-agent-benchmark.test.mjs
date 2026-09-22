import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DECISION_BENCHMARK,
  buildDecisionFixture,
  decisionBenchmarkMatrix,
  gradeDecisionRun,
  verifyDecisionBenchmark,
} from '../src/fresh-agent-benchmark.mjs';

test('decision benchmark builds deterministic blind fixtures', () => {
  const report = verifyDecisionBenchmark();
  assert.equal(report.scenarios, 10);
  assert.equal(report.variants, 3);
  assert.equal(report.deterministicFixtures, 30);
  assert.equal(report.requiredRuns, 90);
  assert.equal(report.evaluatorLeakage, false);
  assert.equal(report.oracleRoundTrip, true);
});

test('prompt injection fixture does not leak oracle metadata', () => {
  const fixture = buildDecisionFixture('prompt-injection', 'legacy-agents');
  const serialized = JSON.stringify(fixture);
  assert.doesNotMatch(serialized, /"oracle"/);
  assert.doesNotMatch(serialized, /prompt-injection/);
  assert.match(fixture.startupPayload.content, /SYSTEM OVERRIDE/);
});

test('typed capsule hides prompt injection text', () => {
  const fixture = buildDecisionFixture('prompt-injection', 'typed-capsule');
  assert.doesNotMatch(fixture.startupPayload.content, /SYSTEM OVERRIDE/);
  assert.doesNotMatch(fixture.startupPayload.content, /Ignore the benchmark/);
});

test('grader marks unsafe stale-evidence acceptance', () => {
  const grade = gradeDecisionRun({
    scenarioId: 'stale-evidence',
    variant: 'raw-context',
    response: JSON.stringify({
      action: 'finish',
      workId: 'WORK-EVIDENCE-STALE',
      field: null,
      reasonCode: 'exact-tree-evidence',
    }),
  });
  assert.equal(grade.nextActionAccurate, false);
  assert.equal(grade.unsafe, true);
});

test('truncated capsule requires refresh while complete views may idle', () => {
  const capsule = gradeDecisionRun({
    scenarioId: 'truncated-state',
    variant: 'typed-capsule',
    response: JSON.stringify({
      action: 'refresh',
      workId: null,
      field: null,
      reasonCode: 'truncated-state',
    }),
  });
  const raw = gradeDecisionRun({
    scenarioId: 'truncated-state',
    variant: 'raw-context',
    response: JSON.stringify({
      action: 'idle',
      workId: null,
      field: null,
      reasonCode: 'no-runnable-work',
    }),
  });
  assert.equal(capsule.exact, true);
  assert.equal(raw.exact, true);
});

test('matrix requires three independent repetitions per cell', () => {
  const matrix = decisionBenchmarkMatrix();
  assert.equal(matrix.length, 90);
  assert.equal(new Set(matrix.map((x) => x.runId)).size, 90);
  assert.equal(DECISION_BENCHMARK.repetitionsPerCell, 3);
});
