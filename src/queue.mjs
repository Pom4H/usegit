import { scopesOverlap } from './scope.mjs';

const RESERVED = new Set(['active', 'awaiting', 'escalated', 'stale']);
const FAILED = new Set(['rejected', 'falsified']);

function overlaps(left = [], right = []) {
  if (!left.length || !right.length) return false;
  return left.some((a) => right.some((b) => scopesOverlap(a, b)));
}

function byPriority(a, b) {
  const priority = (b.priority ?? 0) - (a.priority ?? 0);
  if (priority) return priority;
  const created = String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));
  if (created) return created;
  return a.id.localeCompare(b.id);
}

export function buildWorkerQueue(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const reservations = rows.filter((row) => RESERVED.has(row.status));
  const candidates = rows
    .filter((row) => row.status === 'ready' && row.route?.lane === 'worker' && row.route?.ready)
    .sort(byPriority);

  const workerReady = [];
  const queueBlocked = [];

  for (const candidate of candidates) {
    const reasons = [];
    const scopes = candidate.scopes ?? [];

    if (!scopes.length) {
      reasons.push({ kind: 'missing-scope' });
    }

    for (const dependency of candidate.dependsOn ?? []) {
      const state = byId.get(dependency);
      if (!state) {
        reasons.push({ kind: 'missing-dependency', work: dependency });
      } else if (FAILED.has(state.status)) {
        reasons.push({ kind: 'failed-dependency', work: dependency, status: state.status });
      } else if (state.status !== 'accepted') {
        reasons.push({ kind: 'waiting-dependency', work: dependency, status: state.status });
      }
    }

    const reservedBy = reservations
      .filter((row) => row.id !== candidate.id && overlaps(scopes, row.scopes ?? []))
      .map((row) => row.id);
    if (reservedBy.length) {
      reasons.push({ kind: 'reserved-scope-overlap', work: reservedBy });
    }

    const selectedOverlap = workerReady
      .filter((row) => overlaps(scopes, row.scopes ?? []))
      .map((row) => row.id);
    if (selectedOverlap.length) {
      reasons.push({ kind: 'ready-scope-overlap', work: selectedOverlap });
    }

    if (reasons.length) {
      queueBlocked.push({ ...candidate, blockedBy: reasons });
    } else {
      workerReady.push(candidate);
    }
  }

  return { workerReady, queueBlocked };
}

export function selectNextWorker(rows) {
  return buildWorkerQueue(rows).workerReady[0] ?? null;
}
