import test from 'node:test';
import assert from 'node:assert/strict';
import {
  awaitWorkState,
  compactWorkOverview,
  createWorkState,
  effectiveWorkStatus,
  finishWorkState,
  resumeWorkState,
} from '../src/work-state.mjs';

const T0 = Date.parse('2026-09-22T06:00:00Z');

function fresh() {
  return createWorkState({
    id: 'WORK-1',
    goal: 'ship durable work',
    base: 'abc123',
    owner: 'agent-a',
    now: T0,
    leaseMs: 60_000,
  });
}

test('work needs coordination fields, not a hypothesis', () => {
  const state = fresh();
  assert.equal(state.goal, 'ship durable work');
  assert.equal('hypothesis' in state, false);
  assert.equal('experiment' in state, false);
  assert.equal('route' in state, false);
});

test('active lease becomes stale without mutating stored state', () => {
  const work = fresh();
  assert.equal(effectiveWorkStatus(work, T0 + 30_000), 'active');
  assert.equal(effectiveWorkStatus(work, T0 + 60_001), 'stale');
  assert.equal(work.status, 'active');
});

test('ready work is lease-free and claimable', () => {
  const ready = createWorkState({
    id: 'WORK-Q',
    goal: 'queued',
    scopes: ['src/**'],
    base: 'abc123',
    owner: 'control',
    ready: true,
    now: T0,
  });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.lease, null);

  const claimed = resumeWorkState(ready, {
    owner: 'worker',
    now: T0 + 1,
    leaseMs: 60_000,
  });
  assert.equal(claimed.status, 'active');
  assert.equal(claimed.lease.owner, 'worker');
});

test('await releases the lease and preserves continuations', () => {
  const waiting = awaitWorkState(fresh(), {
    owner: 'agent-a',
    event: 'ci:render',
    onSuccess: 'finish',
    onFailure: 'inspect',
    now: T0 + 10_000,
  });

  assert.equal(waiting.status, 'awaiting');
  assert.equal(waiting.lease, null);
  assert.equal(waiting.awaiting.event, 'ci:render');
  assert.equal(waiting.continuation.success, 'finish');
});

test('a fresh agent resumes awaited work', () => {
  const waiting = awaitWorkState(fresh(), {
    owner: 'agent-a',
    event: 'ci:render',
    onSuccess: 'finish',
    onFailure: 'inspect',
    now: T0 + 10_000,
  });

  const resumed = resumeWorkState(waiting, {
    owner: 'agent-b',
    result: 'success',
    evidence: 'passed',
    now: T0 + 70_000,
    leaseMs: 60_000,
  });

  assert.equal(resumed.status, 'active');
  assert.equal(resumed.lease.owner, 'agent-b');
  assert.equal(resumed.selectedContinuation, 'finish');
});

test('an unexpired lease prevents another agent from stealing active work', () => {
  assert.throws(() => resumeWorkState(fresh(), {
    owner: 'agent-b',
    now: T0 + 30_000,
  }), /lease is held by agent-a/);
});

test('an expired lease can be reclaimed', () => {
  const resumed = resumeWorkState(fresh(), {
    owner: 'agent-b',
    now: T0 + 70_000,
    leaseMs: 60_000,
  });
  assert.equal(resumed.lease.owner, 'agent-b');
});

test('finish creates a terminal decision', () => {
  const done = finishWorkState(fresh(), {
    owner: 'agent-a',
    decision: 'accepted',
    summary: 'validated',
    now: T0 + 20_000,
  });

  assert.equal(done.status, 'accepted');
  const overview = compactWorkOverview([done], T0 + 70_000);
  assert.equal(overview.finished.length, 1);
});
