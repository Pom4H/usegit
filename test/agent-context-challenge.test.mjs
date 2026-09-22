import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentContextChallenge } from '../src/agent-context-challenge.mjs';

test('adversarial context challenge produces an inspectable report', () => {
  const report = buildAgentContextChallenge();
  assert.equal(report.schemaVersion, 1);
  assert.equal(typeof report.robust, 'boolean');
  assert.ok(Array.isArray(report.blockers));
  assert.ok(report.attacks.promptInjection);
  assert.ok(report.attacks.evidenceSemantics);
  assert.ok(report.attacks.workApplicability);
  assert.ok(report.attacks.negativeKnowledgeValidity);
  assert.ok(report.attacks.staleCacheRace);
  assert.ok(report.attacks.scale);
});
