import test from 'node:test';
import assert from 'node:assert/strict';
import { renderView } from '../src/view.mjs';

test('renderView emits a self-contained interactive causal projection', () => {
  const html = renderView({
    repository: 'demo',
    head: '1234567890abcdef',
    generatedAt: '2026-09-22T00:00:00.000Z',
    summary: { changes: 1, activeWork: 1, awaitingWork: 0, structuredCoverage: 1 },
    changes: [{
      id: 'UG-0042',
      title: 'Improve renderer',
      subject: 'perf: improve renderer',
      hypothesis: 'Probe reuse improves quality',
      experiment: 'EXP-0042',
      decision: 'pending',
      granularity: 'dynamic',
      shortSha: '12345678',
      evidenceCount: 2,
      work: [{ id: 'WORK-A', goal: 'measure renderer', status: 'active', evidenceCount: 2 }],
    }],
    next: { experiment: 'EXP-0043' },
  });

  assert.match(html, /<!doctype html>/);
  assert.match(html, /application\/json/);
  assert.match(html, /UG-0042/);
  assert.match(html, /WORK-A/);
  assert.match(html, /Disposable human projection/);
  assert.doesNotMatch(html, /<script[^>]+src=/);
});
