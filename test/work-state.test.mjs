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
    hypothesis: 'git refs preserve execution state',
    base: 'abc123',
    owner: 'agent-a',
    now: T0,
    leaseMs: 60_000,
  });
}

test('active lease becomes stale without mutating stored state', () => {
  const work = fresh();
  assert.equal(effectiveWorkStatus(work, T0 + 30_000), 'active');
  assert.equal(effectiveWorkStatus(work, T0 + 60_001), 'stale');
  assert.equal(work.status, 'active');
});

test('await releases the lease and preserves continuations', () => {
  const waiting = awaitWorkState(fresh(), {
    owner: 'agent-a',
    event: 'ci:render',
    onSuccess: 'combine material experiment',
    onFailure: 'inspect gpu trace',
    now: T0 + 10_000,
  });

  assert.equal(waiting.status, 'awaiting');
  assert.equal(waiting.lease, null);
  assert.equal(waiting.awaiting.event, 'ci:render');
  assert.equal(waiting.continuation.success, 'combine material experiment');
});

test('a fresh agent resumes awaited work from evidence', () => {
  const waiting = awaitWorkState(fresh(), {
    owner: 'agent-a',
    event: 'ci:render',
    onSuccess: 'combine material experiment',
    onFailure: 'inspect gpu trace',
    now: T0 + 10_000,
  });

  const resumed = resumeWorkState(waiting, {
    owner: 'agent-b',
    result: 'success',
    evidence: 'reality gap 0.091 -> 0.074',
    now: T0 + 70_000,
    leaseMs: 60_000,
  });

  assert.equal(resumed.status, 'active');
  assert.equal(resumed.lease.owner, 'agent-b');
  assert.equal(resumed.selectedContinuation, 'combine material experiment');
  assert.equal(resumed.evidence.at(-1).result, 'success');
});

test('an unexpired lease prevents another agent from stealing active work', () => {
  assert.throws(() => resumeWorkState(fresh(), {
    owner: 'agent-b',
    now: T0 + 30_000,
  }), /lease is held by agent-a/);
});

test('an expired lease can be taken over', () => {
  const resumed = resumeWorkState(fresh(), {
    owner: 'agent-b',
    now: T0 + 70_000,
    leaseMs: 60_000,
  });
  assert.equal(resumed.lease.owner, 'agent-b');
});

test('finish creates a terminal decision and compact overview surfaces stale work', () => {
  const done = finishWorkState(fresh(), {
    owner: 'agent-a',
    decision: 'accepted',
    summary: 'validated',
    now: T0 + 20_000,
  });
  assert.equal(done.status, 'accepted');

  const overview = compactWorkOverview([fresh(), done], T0 + 70_000);
  assert.equal(overview.stale.length, 1);
  assert.equal(overview.finished.length, 1);
});
