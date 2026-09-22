import { resourcesConflict } from './resource.mjs';
import { scopesOverlap } from './scope.mjs';

const RESERVED = new Set(['active', 'awaiting', 'escalated', 'stale']);
const FAILED = new Set(['rejected', 'falsified']);

function pathOverlaps(left = [], right = []) {
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

function conflictReasons(candidate, other, prefix) {
  const reasons = [];
  if (pathOverlaps(candidate.scopes ?? [], other.scopes ?? [])) {
    reasons.push({ kind: prefix + '-scope-overlap', work: [other.id] });
  }
  const semantic = resourcesConflict(candidate.resources ?? [], other.resources ?? []);
  if (semantic.length) {
    reasons.push({
      kind: prefix + '-resource-overlap',
      work: [other.id],
      overlaps: semantic,
    });
  }
  return reasons;
}

export function buildWorkerQueue(rows) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const reservations = rows.filter((row) => RESERVED.has(row.status));
  const candidates = rows.filter((row) => row.status === 'ready').sort(byPriority);

  const workerReady = [];
  const queueBlocked = [];

  for (const candidate of candidates) {
    const reasons = [];

    if (!(candidate.scopes ?? []).length) reasons.push({ kind: 'missing-scope' });

    for (const dependency of candidate.dependsOn ?? []) {
      const state = byId.get(dependency);
      if (!state) reasons.push({ kind: 'missing-dependency', work: dependency });
      else if (FAILED.has(state.status)) {
        reasons.push({ kind: 'failed-dependency', work: dependency, status: state.status });
      } else if (state.status !== 'accepted') {
        reasons.push({ kind: 'waiting-dependency', work: dependency, status: state.status });
      }
    }

    for (const reserved of reservations) {
      if (reserved.id !== candidate.id) {
        reasons.push(...conflictReasons(candidate, reserved, 'reserved'));
      }
    }

    for (const selected of workerReady) {
      reasons.push(...conflictReasons(candidate, selected, 'ready'));
    }

    if (reasons.length) queueBlocked.push({ ...candidate, blockedBy: reasons });
    else workerReady.push(candidate);
  }

  return { workerReady, queueBlocked };
}

export function selectNextWorker(rows) {
  return buildWorkerQueue(rows).workerReady[0] ?? null;
}
