import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evidenceIntegrity,
  evidenceIsAdmissible,
  normalizeEvidence,
  supportingEvidenceForTree,
} from '../src/evidence.mjs';
import { createWorkState, recordEvidenceState } from '../src/work-state.mjs';

const observed = (overrides = {}) => normalizeEvidence({
  kind: 'observed',
  source: 'ci:run-1',
  result: 'success',
  tree: 'tree-a',
  commit: 'commit-a',
  environment: { runner: 'linux' },
  observedAt: '2026-09-22T10:00:00.000Z',
  ...overrides,
});

test('first-pass evidence is acceptance-grade; retry and flaky passes are not', () => {
  const firstPass = observed();
  const retryPass = observed({ quality: 'retry-pass', source: 'ci:run-2' });
  const flaky = observed({ quality: 'flaky', source: 'ci:run-3' });
  assert.equal(evidenceIsAdmissible(firstPass), true);
  assert.equal(evidenceIsAdmissible(retryPass), false);
  assert.equal(evidenceIsAdmissible(flaky), false);
  assert.deepEqual(
    supportingEvidenceForTree([firstPass, retryPass, flaky], 'tree-a').map((x) => x.id),
    [firstPass.id],
  );
});

test('evidence digest detects payload tampering and blocks acceptance', () => {
  const record = observed();
  const tampered = { ...record, observation: 'rewritten after the run' };
  assert.equal(evidenceIntegrity(record).valid, true);
  assert.equal(evidenceIntegrity(tampered).valid, false);
  assert.equal(evidenceIsAdmissible(tampered), false);
  assert.equal(supportingEvidenceForTree([tampered], 'tree-a').length, 0);
});

test('duplicate evidence delivery is idempotent even when receipt time changes', () => {
  const T0 = Date.parse('2026-09-22T10:00:00Z');
  const work = createWorkState({
    id: 'WORK-EVIDENCE',
    goal: 'dedupe CI delivery',
    hypothesis: 'same observation is recorded once',
    base: 'commit-a',
    baseTree: 'tree-a',
    owner: 'agent-a',
    now: T0,
  });
  const delivery = {
    kind: 'observed',
    source: 'ci:run-1',
    result: 'success',
    tree: 'tree-a',
    commit: 'commit-a',
    environment: { runner: 'linux' },
  };
  const once = recordEvidenceState(work, { owner: 'agent-a', evidence: delivery, now: T0 + 1_000 });
  const twice = recordEvidenceState(once, { owner: 'agent-a', evidence: delivery, now: T0 + 2_000 });
  assert.equal(once.evidence.length, 1);
  assert.equal(twice, once);
});

test('tampered normalized evidence is rejected when re-recorded', () => {
  const T0 = Date.parse('2026-09-22T10:00:00Z');
  const work = createWorkState({
    id: 'WORK-COLLISION',
    goal: 'reject evidence tampering',
    hypothesis: 'stored digest is authoritative',
    base: 'commit-a',
    baseTree: 'tree-a',
    owner: 'agent-a',
    now: T0,
  });
  const evidence = observed();
  const once = recordEvidenceState(work, { owner: 'agent-a', evidence, now: T0 + 1_000 });
  assert.throws(() => recordEvidenceState(once, {
    owner: 'agent-a',
    evidence: { ...evidence, digest: '0'.repeat(64) },
    now: T0 + 2_000,
  }), /evidence digest does not match payload/);
});
