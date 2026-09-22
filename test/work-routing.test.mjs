import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compactWorkOverview,
  createWorkState,
  escalateWorkState,
  resumeWorkState,
} from '../src/work-state.mjs';

const T0 = Date.parse('2026-09-22T06:00:00Z');

function workerReady() {
  return createWorkState({
    id: 'WORK-W',
    goal: 'execute bounded change',
    hypothesis: 'objective contract is enough for cheap execution',
    scopes: ['src/worker/**'],
    contract: {
      success: 'metric improves by 5%',
      evidence: 'deterministic CI metric',
    },
    routing: {
      uncertainty: 'low',
      oracle: 'objective',
    },
    base: 'abc123',
    owner: 'control-a',
    now: T0,
  });
}

test('control-created worker task is queued without a lease', () => {
  const work = workerReady();
  assert.equal(work.status, 'ready');
  assert.equal(work.lease, null);
  assert.equal(work.createdBy, 'control-a');
  assert.equal(work.route.lane, 'worker');
  assert.equal(work.route.ready, true);
});

test('worker atomically claims a ready task through resume semantics', () => {
  const claimed = resumeWorkState(workerReady(), {
    owner: 'instant-worker-1',
    now: T0 + 1_000,
    leaseMs: 60_000,
  });
  assert.equal(claimed.status, 'active');
  assert.equal(claimed.lease.owner, 'instant-worker-1');
});

test('worker can escalate unexpected ambiguity back to control', () => {
  const claimed = resumeWorkState(workerReady(), {
    owner: 'instant-worker-1',
    now: T0 + 1_000,
    leaseMs: 60_000,
  });
  const escalated = escalateWorkState(claimed, {
    owner: 'instant-worker-1',
    reason: 'evidence contradicts architecture assumption',
    now: T0 + 2_000,
  });

  assert.equal(escalated.status, 'escalated');
  assert.equal(escalated.lease, null);
  assert.equal(escalated.route.lane, 'control');
  assert.equal(escalated.route.reasoning, 'deep');
  assert.equal(escalated.escalation.reason, 'evidence contradicts architecture assumption');
});

test('compact context separates worker queue from control queue', () => {
  const worker = workerReady();
  const control = createWorkState({
    id: 'WORK-C',
    goal: 'choose architecture',
    hypothesis: 'architecture choice needs deeper reasoning',
    scopes: ['src/core/**'],
    contract: {},
    routing: {
      uncertainty: 'high',
      oracle: 'none',
      architectureDecision: true,
    },
    base: 'abc123',
    owner: 'control-a',
    now: T0,
  });

  const overview = compactWorkOverview([worker, control], T0 + 1_000);
  assert.deepEqual(overview.workerReady.map((x) => x.id), ['WORK-W']);
  assert.deepEqual(overview.controlQueue.map((x) => x.id), ['WORK-C']);
});
