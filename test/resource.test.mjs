import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeResources,
  resourceNamesOverlap,
  resourcesConflict,
  workResourceConflicts,
} from '../src/resource.mjs';

test('resources normalize and write dominates duplicate read', () => {
  assert.deepEqual(normalizeResources([
    { name: 'renderer.lighting', access: 'read' },
    'renderer.lighting=write',
    'metric.reality-gap=read',
  ]), [
    { name: 'metric.reality-gap', access: 'read' },
    { name: 'renderer.lighting', access: 'write' },
  ]);
});

test('semantic namespaces overlap hierarchically', () => {
  assert.equal(resourceNamesOverlap('renderer.*', 'renderer.lighting'), true);
  assert.equal(resourceNamesOverlap('renderer.lighting', 'renderer.materials'), false);
  assert.equal(resourceNamesOverlap('*', 'gpu.frame-budget'), true);
});

test('read/read is concurrent but any write conflicts', () => {
  assert.deepEqual(resourcesConflict(
    ['metric.reality-gap=read'],
    ['metric.reality-gap=read'],
  ), []);

  const conflict = resourcesConflict(
    ['metric.reality-gap=read'],
    ['metric.reality-gap=write'],
  );
  assert.equal(conflict.length, 1);
  assert.deepEqual(conflict[0].access, ['read', 'write']);
});

test('semantic conflict is detected independently of file scopes', () => {
  const conflicts = workResourceConflicts([
    {
      id: 'WORK-A',
      status: 'active',
      resources: [{ name: 'renderer.lighting', access: 'write' }],
    },
    {
      id: 'WORK-B',
      status: 'awaiting',
      resources: [{ name: 'renderer.lighting', access: 'read' }],
    },
  ]);
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].reason, 'semantic-resource-overlap');
});
