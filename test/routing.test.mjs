import test from 'node:test';
import assert from 'node:assert/strict';
import { escalateRoute, recommendRoute } from '../src/routing.mjs';

const contract = {
  success: 'metric improves by at least 5%',
  evidence: 'deterministic CI metric',
};

test('bounded objective work routes to instant worker', () => {
  const route = recommendRoute({
    uncertainty: 'low',
    oracle: 'objective',
  }, contract);

  assert.equal(route.lane, 'worker');
  assert.equal(route.reasoning, 'instant');
  assert.equal(route.ready, true);
  assert.deepEqual(route.blockers, []);
});

test('missing contract stays in control plane', () => {
  const route = recommendRoute({
    uncertainty: 'low',
    oracle: 'objective',
  }, {});

  assert.equal(route.lane, 'control');
  assert.equal(route.reasoning, 'deep');
  assert.equal(route.ready, false);
  assert.deepEqual(route.blockers, ['missing-success-criterion', 'missing-evidence-plan']);
});

test('architecture, conflicting evidence and repeated failures force control', () => {
  const route = recommendRoute({
    uncertainty: 'low',
    oracle: 'objective',
    architectureDecision: true,
    evidenceConflict: true,
    failedAttempts: 3,
  }, contract);

  assert.equal(route.lane, 'control');
  assert.deepEqual(route.blockers, [
    'architecture-decision',
    'conflicting-evidence',
    'repeated-failure',
  ]);
});

test('explicit worker override is visible but not execution-ready when blockers remain', () => {
  const route = recommendRoute({
    lane: 'worker',
    uncertainty: 'high',
    oracle: 'none',
  }, contract);

  assert.equal(route.lane, 'worker');
  assert.equal(route.ready, false);
  assert.equal(route.source, 'explicit');
  assert.ok(route.blockers.includes('uncertainty-high'));
  assert.ok(route.blockers.includes('oracle-none'));
});

test('escalation always moves the work to deep control', () => {
  const route = recommendRoute({ uncertainty: 'low', oracle: 'objective' }, contract);
  const escalated = escalateRoute(route, 'unexpected invariant failure');

  assert.equal(escalated.lane, 'control');
  assert.equal(escalated.reasoning, 'deep');
  assert.equal(escalated.ready, false);
  assert.equal(escalated.source, 'escalation');
  assert.ok(escalated.blockers.includes('worker-escalation'));
});
