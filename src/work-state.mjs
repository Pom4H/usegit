const TERMINAL = new Set(['accepted', 'rejected', 'falsified']);

function iso(value) {
  return new Date(value).toISOString();
}

export function createWorkState({
  id,
  goal,
  hypothesis,
  experiment = null,
  base,
  owner,
  now = Date.now(),
  leaseMs = 30 * 60_000,
}) {
  if (!id || !goal || !hypothesis || !base || !owner) {
    throw new Error('work requires id, goal, hypothesis, base and owner');
  }

  return {
    schemaVersion: 1,
    id,
    goal,
    hypothesis,
    experiment,
    base,
    status: 'active',
    createdAt: iso(now),
    updatedAt: iso(now),
    lease: {
      owner,
      acquiredAt: iso(now),
      expiresAt: iso(now + leaseMs),
    },
    awaiting: null,
    continuation: null,
    selectedContinuation: null,
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

  const nextEvidence = [...(work.evidence ?? [])];
  if (work.status === 'awaiting') {
    nextEvidence.push({
      event: work.awaiting?.event ?? null,
      result,
      observation: evidence,
      observedAt: iso(now),
    });
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
    owner: work.lease?.owner ?? null,
    leaseExpiresAt: work.lease?.expiresAt ?? null,
    awaiting: work.awaiting?.event ?? null,
    continuation: work.selectedContinuation ?? null,
    updatedAt: work.updatedAt,
  }));

  return {
    active: rows.filter((x) => x.status === 'active'),
    awaiting: rows.filter((x) => x.status === 'awaiting'),
    stale: rows.filter((x) => x.status === 'stale'),
    finished: rows.filter((x) => TERMINAL.has(x.status)),
  };
}
