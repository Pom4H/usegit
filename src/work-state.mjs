import { normalizeEvidence } from './evidence.mjs';
import { buildWorkerQueue } from './queue.mjs';
import { normalizeResources, workResourceConflicts } from './resource.mjs';
import { escalateRoute, recommendRoute } from './routing.mjs';
import { normalizeScopes, workConflicts } from './scope.mjs';

const TERMINAL = new Set(['accepted', 'rejected', 'falsified']);

function iso(value) {
  return new Date(value).toISOString();
}

function normalizeContract(contract = {}) {
  return {
    success: contract?.success ?? null,
    evidence: contract?.evidence ?? null,
  };
}

function normalizeDependsOn(dependsOn = []) {
  if (!Array.isArray(dependsOn)) throw new Error('dependsOn must be an array');
  return [...new Set(dependsOn.map(String))].sort();
}

export function createWorkState({
  id,
  goal,
  hypothesis,
  experiment = null,
  scopes = [],
  resources = [],
  contract = {},
  routing = {},
  batchId = null,
  priority = 0,
  dependsOn = [],
  base,
  baseTree = null,
  owner,
  now = Date.now(),
  leaseMs = 30 * 60_000,
}) {
  if (!id || !goal || !hypothesis || !base || !owner) {
    throw new Error('work requires id, goal, hypothesis, base and owner');
  }

  const normalizedScopes = normalizeScopes(scopes);
  const normalizedResources = normalizeResources(resources);
  const normalizedContract = normalizeContract(contract);
  const route = recommendRoute(routing, normalizedContract);
  if (route.lane === 'worker' && route.ready && !normalizedScopes.length) {
    route.ready = false;
    route.blockers = [...new Set([...(route.blockers ?? []), 'missing-scope'])];
  }
  const dispatchToWorker = route.lane === 'worker' && route.ready;

  return {
    schemaVersion: 2,
    id,
    goal,
    hypothesis,
    experiment,
    batchId,
    priority: Number(priority) || 0,
    dependsOn: normalizeDependsOn(dependsOn),
    scopes: normalizedScopes,
    resources: normalizedResources,
    contract: normalizedContract,
    route,
    base,
    baseTree,
    status: dispatchToWorker ? 'ready' : 'active',
    createdBy: owner,
    createdAt: iso(now),
    updatedAt: iso(now),
    lease: dispatchToWorker ? null : {
      owner,
      acquiredAt: iso(now),
      expiresAt: iso(now + leaseMs),
    },
    awaiting: null,
    continuation: null,
    selectedContinuation: null,
    escalation: null,
    evidence: [],
    decision: null,
  };
}

export function effectiveWorkStatus(work, now = Date.now()) {
  if (work.status !== 'active') return work.status;
  const expiresAt = Date.parse(work.lease?.expiresAt ?? '');
  return Number.isFinite(expiresAt) && expiresAt <= now ? 'stale' : 'active';
}

function assertMutable(work) {
  if (TERMINAL.has(work.status)) {
    throw new Error(`${work.id} is already ${work.status}`);
  }
}

function assertOwner(work, owner, now) {
  if (work.status !== 'active') return;
  const effective = effectiveWorkStatus(work, now);
  if (effective === 'active' && work.lease?.owner && work.lease.owner !== owner) {
    throw new Error(`${work.id} lease is held by ${work.lease.owner} until ${work.lease.expiresAt}`);
  }
}

function appendEvidence(records, evidence, now) {
  const record = normalizeEvidence({
    ...evidence,
    observedAt: evidence?.observedAt ?? iso(now),
  });
  const prior = records.find((item) => item?.id && item.id === record.id);
  if (!prior) return { records: [...records, record], added: true, record };

  if (prior.digest && record.digest && prior.digest !== record.digest) {
    throw new Error(`evidence identity collision for ${record.id}`);
  }
  return { records, added: false, record: prior };
}

export function recordEvidenceState(work, {
  owner,
  evidence,
  now = Date.now(),
}) {
  assertMutable(work);
  if (work.status === 'active') assertOwner(work, owner, now);
  const appended = appendEvidence([...(work.evidence ?? [])], evidence, now);
  if (!appended.added) return work;
  return {
    ...work,
    updatedAt: iso(now),
    evidence: appended.records,
  };
}

export function awaitWorkState(work, {
  owner,
  event,
  onSuccess = null,
  onFailure = null,
  now = Date.now(),
}) {
  assertMutable(work);
  if (!event) throw new Error('await requires an event');
  assertOwner(work, owner, now);

  return {
    ...work,
    status: 'awaiting',
    updatedAt: iso(now),
    lease: null,
    awaiting: {
      event,
      since: iso(now),
    },
    continuation: {
      success: onSuccess,
      failure: onFailure,
    },
    selectedContinuation: null,
  };
}

export function escalateWorkState(work, {
  owner,
  reason,
  now = Date.now(),
}) {
  assertMutable(work);
  if (!reason) throw new Error('escalation requires a reason');
  assertOwner(work, owner, now);

  return {
    ...work,
    status: 'escalated',
    updatedAt: iso(now),
    lease: null,
    awaiting: null,
    route: escalateRoute(work.route, reason),
    escalation: {
      reason,
      fromOwner: owner,
      at: iso(now),
    },
  };
}

export function resumeWorkState(work, {
  owner,
  result = null,
  evidence = null,
  now = Date.now(),
  leaseMs = 30 * 60_000,
}) {
  assertMutable(work);
  if (!owner) throw new Error('resume requires an owner');

  const effective = effectiveWorkStatus(work, now);
  if (effective === 'active' && work.lease?.owner !== owner) {
    throw new Error(`${work.id} lease is held by ${work.lease.owner} until ${work.lease.expiresAt}`);
  }

  if (work.status === 'awaiting' && !result) {
    throw new Error(`${work.id} is awaiting ${work.awaiting?.event}; resume requires --result`);
  }

  const selectedContinuation = work.status === 'awaiting'
    ? (result === 'success' ? work.continuation?.success : result === 'failure' ? work.continuation?.failure : null)
    : work.selectedContinuation;

  let nextEvidence = [...(work.evidence ?? [])];
  if (work.status === 'awaiting' && evidence) {
    nextEvidence = appendEvidence(nextEvidence, {
      ...evidence,
      event: evidence.event ?? work.awaiting?.event ?? null,
      result: evidence.result ?? result,
    }, now).records;
  }

  return {
    ...work,
    status: 'active',
    updatedAt: iso(now),
    lease: {
      owner,
      acquiredAt: iso(now),
      expiresAt: iso(now + leaseMs),
    },
    awaiting: null,
    selectedContinuation,
    evidence: nextEvidence,
  };
}

export function finishWorkState(work, {
  owner,
  decision = 'accepted',
  summary = null,
  subject = null,
  now = Date.now(),
}) {
  assertMutable(work);
  if (!TERMINAL.has(decision)) {
    throw new Error('finish decision must be accepted, rejected or falsified');
  }
  assertOwner(work, owner, now);

  return {
    ...work,
    status: decision,
    updatedAt: iso(now),
    lease: null,
    awaiting: null,
    decision: {
      outcome: decision,
      summary,
      subject,
      at: iso(now),
    },
  };
}

export function compactWorkOverview(states, now = Date.now()) {
  const rows = states.map((work) => ({
    id: work.id,
    status: effectiveWorkStatus(work, now),
    goal: work.goal,
    experiment: work.experiment,
    batchId: work.batchId ?? null,
    priority: work.priority ?? 0,
    dependsOn: normalizeDependsOn(work.dependsOn ?? []),
    scopes: normalizeScopes(work.scopes ?? []),
    resources: normalizeResources(work.resources ?? []),
    contract: normalizeContract(work.contract ?? {}),
    route: work.route ?? recommendRoute({}, work.contract ?? {}),
    base: work.base,
    baseTree: work.baseTree ?? null,
    createdAt: work.createdAt,
    owner: work.lease?.owner ?? null,
    leaseExpiresAt: work.lease?.expiresAt ?? null,
    awaiting: work.awaiting?.event ?? null,
    continuation: work.selectedContinuation ?? null,
    escalation: work.escalation?.reason ?? null,
    evidenceCount: (work.evidence ?? []).length,
    decision: work.decision ?? null,
    updatedAt: work.updatedAt,
  }));

  const dispatch = buildWorkerQueue(rows);
  const conflicts = [
    ...workConflicts(rows),
    ...workResourceConflicts(rows),
  ];

  return {
    workerReady: dispatch.workerReady,
    queueBlocked: dispatch.queueBlocked,
    controlQueue: rows.filter((x) =>
      x.status === 'escalated' ||
      (x.status === 'active' && (x.route?.lane === 'control' || !x.route?.ready))),
    active: rows.filter((x) => x.status === 'active'),
    ready: rows.filter((x) => x.status === 'ready'),
    awaiting: rows.filter((x) => x.status === 'awaiting'),
    escalated: rows.filter((x) => x.status === 'escalated'),
    stale: rows.filter((x) => x.status === 'stale'),
    finished: rows.filter((x) => TERMINAL.has(x.status)),
    conflicts,
  };
}
