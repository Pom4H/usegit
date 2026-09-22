import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkerQueue } from '../src/queue.mjs';

function ready(id, scopes, priority = 0, extra = {}) {
  return {
    id,
    status: 'ready',
    scopes,
    resources: [],
    priority,
    dependsOn: [],
    route: { lane: 'worker', ready: true },
    ...extra,
  };
}

test('worker queue exposes a deterministic independent set of scopes', () => {
  const queue = buildWorkerQueue([
    ready('WORK-A', ['src/a/**'], 30),
    ready('WORK-B', ['src/a/file.ts'], 20),
    ready('WORK-C', ['src/c/**'], 10),
  ]);

  assert.deepEqual(queue.workerReady.map((x) => x.id), ['WORK-A', 'WORK-C']);
  assert.equal(queue.queueBlocked.length, 1);
  assert.equal(queue.queueBlocked[0].id, 'WORK-B');
  assert.equal(queue.queueBlocked[0].blockedBy[0].kind, 'ready-scope-overlap');
});

test('semantic resources block hidden conflicts across disjoint files', () => {
  const queue = buildWorkerQueue([
    ready('WORK-A', ['src/a/**'], 30, {
      resources: [{ name: 'renderer.lighting', access: 'write' }],
    }),
    ready('WORK-B', ['src/b/**'], 20, {
      resources: [{ name: 'renderer.lighting', access: 'read' }],
    }),
    ready('WORK-C', ['src/c/**'], 10, {
      resources: [{ name: 'renderer.materials', access: 'write' }],
    }),
  ]);

  assert.deepEqual(queue.workerReady.map((x) => x.id), ['WORK-A', 'WORK-C']);
  assert.ok(queue.queueBlocked[0].blockedBy.some((x) => x.kind === 'ready-resource-overlap'));
});

test('active and awaiting work reserve their scopes', () => {
  const queue = buildWorkerQueue([
    { id: 'WORK-LIVE', status: 'active', scopes: ['src/a/**'], resources: [] },
    { id: 'WORK-WAIT', status: 'awaiting', scopes: ['src/b/**'], resources: [] },
    ready('WORK-A', ['src/a/new.ts'], 20),
    ready('WORK-B', ['src/b/new.ts'], 10),
    ready('WORK-C', ['src/c/**'], 5),
  ]);

  assert.deepEqual(queue.workerReady.map((x) => x.id), ['WORK-C']);
  assert.deepEqual(queue.queueBlocked.map((x) => x.id), ['WORK-A', 'WORK-B']);
  assert.ok(queue.queueBlocked.every((x) =>
    x.blockedBy.some((reason) => reason.kind === 'reserved-scope-overlap')));
});

test('dependencies gate dispatch until accepted', () => {
  const pending = buildWorkerQueue([
    { id: 'WORK-BASE', status: 'active', scopes: ['src/base/**'], resources: [] },
    ready('WORK-NEXT', ['src/next/**'], 10, { dependsOn: ['WORK-BASE'] }),
  ]);
  assert.equal(pending.workerReady.length, 0);
  assert.equal(pending.queueBlocked[0].blockedBy[0].kind, 'waiting-dependency');

  const accepted = buildWorkerQueue([
    { id: 'WORK-BASE', status: 'accepted', scopes: ['src/base/**'], resources: [] },
    ready('WORK-NEXT', ['src/next/**'], 10, { dependsOn: ['WORK-BASE'] }),
  ]);
  assert.deepEqual(accepted.workerReady.map((x) => x.id), ['WORK-NEXT']);
});
