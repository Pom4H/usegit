import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agentContextCriticalFieldRecall,
  agentContextFingerprint,
  compactNegativeKnowledge,
  renderAgentContext,
} from '../src/agent-context.mjs';

function fixture() {
  return {
    schemaVersion: 1,
    head: '1234567890abcdef',
    work: {
      workerReady: [{
        id: 'WORK-A',
        status: 'ready',
        goal: 'measure renderer',
        experiment: 'EXP-0013',
        priority: 10,
        dependsOn: ['WORK-Z'],
        scopes: ['src/**'],
        resources: [{ name: 'metric.quality', access: 'read' }],
        contract: {
          success: 'quality improves',
          evidence: 'deterministic CI metric',
        },
        owner: 'agent-1',
        leaseExpiresAt: '2026-09-22T14:00:00.000Z',
        awaiting: null,
        continuation: null,
        escalation: null,
        evidenceCount: 2,
        decision: null,
        route: 'worker',
      }],
      queueBlocked: [],
      controlQueue: [],
      active: [],
      awaiting: [],
      stale: [],
      conflicts: [],
    },
    experiments: [{
      id: 'EXP-0013',
      question: 'Can compiled context reduce startup cost?',
      hypothesis: 'Compiled context preserves decision-critical state.',
      status: 'running',
    }],
    negativeKnowledge: [{
      hypothesis: 'retry-without-new-conditions',
      decision: 'falsified',
      changeId: 'UG-NEG-0001',
      experiment: 'EXP-0009',
      sha: 'aaaaaaaaaaaa',
    }],
    recentCausalHistory: [{
      sha: '1234567890ab',
      subject: 'feat: compile context',
      changeId: 'UG-CONTEXT-0001',
      experiment: 'EXP-0013',
      intent: 'compile-agent-context',
      hypothesis: 'compiled-context-is-enough',
      granularity: 'dynamic',
      decision: 'pending',
    }],
    next: {
      kind: 'resolve-oldest-experiment',
      experiment: 'EXP-0013',
      reason: 'measure the projection',
    },
  };
}

test('compiled agent context is deterministic', () => {
  const model = fixture();
  assert.equal(renderAgentContext(model), renderAgentContext(structuredClone(model)));
  assert.equal(agentContextFingerprint(model), agentContextFingerprint(structuredClone(model)));
});

test('fingerprint changes when decision-critical work state changes', () => {
  const before = fixture();
  const after = fixture();
  after.work.workerReady[0].status = 'active';
  after.work.workerReady[0].owner = 'agent-2';
  assert.notEqual(agentContextFingerprint(before), agentContextFingerprint(after));
});

test('rendered context preserves every declared decision-critical token', () => {
  const model = fixture();
  const markdown = renderAgentContext(model);
  assert.equal(agentContextCriticalFieldRecall(model, markdown), 1);
  assert.match(markdown, /WORK-A/);
  assert.match(markdown, /metric\.quality:read/);
  assert.match(markdown, /quality improves/);
  assert.match(markdown, /UG-CONTEXT-0001/);
  assert.match(markdown, /resolve-oldest-experiment/);
  assert.match(markdown, /never source of truth/);
  assert.match(markdown, /usegit:context-fingerprint/);
});


test('negative knowledge expires only when conditions explicitly change', () => {
  const commits = [
    {
      sha: 'new-condition',
      metadata: {
        changeId: 'UG-3',
        experiment: 'EXP-3',
        hypothesis: 'old-hypothesis',
        decision: 'pending',
        conditionsChanged: 'true',
      },
    },
    {
      sha: 'falsified-old',
      metadata: {
        changeId: 'UG-2',
        experiment: 'EXP-2',
        hypothesis: 'old-hypothesis',
        decision: 'falsified',
      },
    },
    {
      sha: 'rejected-still-active',
      metadata: {
        changeId: 'UG-1',
        experiment: 'EXP-1',
        hypothesis: 'still-bad',
        decision: 'rejected',
      },
    },
  ];

  assert.deepEqual(compactNegativeKnowledge(commits), [{
    hypothesis: 'still-bad',
    decision: 'rejected',
    changeId: 'UG-1',
    experiment: 'EXP-1',
    sha: 'rejected-sti',
  }]);
});
