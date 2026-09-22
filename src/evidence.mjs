import { createHash } from 'node:crypto';

const TRUST = new Set(['asserted', 'observed', 'attested']);
const POSITIVE = new Set(['success', 'passed', 'pass', 'accepted', 'ok', 'true']);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

export function environmentSnapshot(env = process.env) {
  return {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    ci: env.CI ?? null,
    githubActions: env.GITHUB_ACTIONS ?? null,
    runnerOs: env.RUNNER_OS ?? null,
    runnerArch: env.RUNNER_ARCH ?? null,
    workflow: env.GITHUB_WORKFLOW ?? null,
    runId: env.GITHUB_RUN_ID ?? null,
    runAttempt: env.GITHUB_RUN_ATTEMPT ?? null,
  };
}

export function environmentFingerprint(environment) {
  return createHash('sha256')
    .update(JSON.stringify(stable(environment ?? {})))
    .digest('hex');
}

export function normalizeEvidence(input = {}) {
  const kind = input.kind ?? 'asserted';
  if (!TRUST.has(kind)) throw new Error('evidence kind must be asserted, observed or attested');

  const environment = input.environment ?? {};
  const record = {
    kind,
    event: input.event ?? null,
    result: input.result ?? null,
    observation: input.observation ?? null,
    source: input.source ?? null,
    subject: {
      commit: input.commit ?? input.subject?.commit ?? null,
      tree: input.tree ?? input.subject?.tree ?? null,
    },
    environment,
    environmentHash: environmentFingerprint(environment),
    observedAt: input.observedAt ?? new Date().toISOString(),
  };

  if ((kind === 'observed' || kind === 'attested') && !record.source) {
    throw new Error(`${kind} evidence requires a source`);
  }
  if ((kind === 'observed' || kind === 'attested') && !record.subject.tree) {
    throw new Error(`${kind} evidence requires an exact Git tree`);
  }

  return record;
}

export function evidenceTrust(kind) {
  return kind === 'attested' ? 2 : kind === 'observed' ? 1 : 0;
}

export function evidenceIsPositive(record) {
  if (record?.result === true) return true;
  return POSITIVE.has(String(record?.result ?? '').toLowerCase());
}

export function trustedEvidenceForTree(evidence = [], tree) {
  return evidence.filter((record) =>
    evidenceTrust(record.kind) >= 1 &&
    record.subject?.tree === tree);
}

export function supportingEvidenceForTree(evidence = [], tree) {
  return trustedEvidenceForTree(evidence, tree).filter(evidenceIsPositive);
}
