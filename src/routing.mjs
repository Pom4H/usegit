const UNCERTAINTY = new Set(['low', 'medium', 'high']);
const ORACLES = new Set(['objective', 'partial', 'none']);
const LANES = new Set(['auto', 'worker', 'control']);

function bool(value) {
  return value === true || value === 'true';
}

function integer(value) {
  const n = Number(value ?? 0);
  if (!Number.isInteger(n) || n < 0) throw new Error('failedAttempts must be a non-negative integer');
  return n;
}

export function normalizeRoutingInput(input = {}) {
  const lane = input.lane ?? 'auto';
  const uncertainty = input.uncertainty ?? 'medium';
  const oracle = input.oracle ?? 'partial';

  if (!LANES.has(lane)) throw new Error('lane must be auto, worker or control');
  if (!UNCERTAINTY.has(uncertainty)) throw new Error('uncertainty must be low, medium or high');
  if (!ORACLES.has(oracle)) throw new Error('oracle must be objective, partial or none');

  return {
    lane,
    uncertainty,
    oracle,
    architectureDecision: bool(input.architectureDecision),
    evidenceConflict: bool(input.evidenceConflict),
    failedAttempts: integer(input.failedAttempts),
  };
}

export function recommendRoute(input = {}, contract = {}) {
  const signals = normalizeRoutingInput(input);
  const blockers = [];

  if (!contract?.success) blockers.push('missing-success-criterion');
  if (!contract?.evidence) blockers.push('missing-evidence-plan');
  if (signals.uncertainty !== 'low') blockers.push(`uncertainty-${signals.uncertainty}`);
  if (signals.oracle !== 'objective') blockers.push(`oracle-${signals.oracle}`);
  if (signals.architectureDecision) blockers.push('architecture-decision');
  if (signals.evidenceConflict) blockers.push('conflicting-evidence');
  if (signals.failedAttempts >= 3) blockers.push('repeated-failure');

  const autoLane = blockers.length ? 'control' : 'worker';
  const lane = signals.lane === 'auto' ? autoLane : signals.lane;
  const ready = lane === 'worker' && blockers.length === 0;

  return {
    lane,
    reasoning: lane === 'worker' ? 'instant' : 'deep',
    ready,
    source: signals.lane === 'auto' ? 'policy' : 'explicit',
    blockers,
    signals,
  };
}

export function escalateRoute(route, reason) {
  if (!reason) throw new Error('escalation requires a reason');
  return {
    ...(route ?? {}),
    lane: 'control',
    reasoning: 'deep',
    ready: false,
    source: 'escalation',
    blockers: [...new Set([...(route?.blockers ?? []), 'worker-escalation'])],
  };
}
