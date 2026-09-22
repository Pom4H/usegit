import { createHash } from 'node:crypto';

const TRUST = new Set(['asserted', 'observed', 'attested']);
const POSITIVE = new Set(['success', 'passed', 'pass', 'accepted', 'ok', 'true']);
const QUALITY = new Set([
  'first-pass',
  'retry-pass',
  'quarantined',
  'flaky',
  'manual-attestation',
  'derived',
  'untrusted',
]);
const ADMISSIBLE_QUALITY = new Set(['first-pass', 'manual-attestation']);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function hash(value) {
  return createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex');
}

function defaultQuality(kind) {
  if (kind === 'observed') return 'first-pass';
  if (kind === 'attested') return 'manual-attestation';
  return 'untrusted';
}

function normalizeRun(run = null) {
  if (!run) return null;
  const attempt = run.attempt === null || run.attempt === undefined
    ? null
    : Number(run.attempt);
  return {
    provider: run.provider ?? null,
    id: run.id ?? null,
    attempt: Number.isFinite(attempt) ? attempt : null,
  };
}

function normalizeArtifacts(artifacts = []) {
  if (!Array.isArray(artifacts)) throw new Error('evidence artifacts must be an array');
  return artifacts.map((artifact) => ({
    name: artifact?.name ?? null,
    mediaType: artifact?.mediaType ?? artifact?.media_type ?? null,
    sha256: artifact?.sha256 ?? null,
    bytes: artifact?.bytes === null || artifact?.bytes === undefined
      ? null
      : Number(artifact.bytes),
  }));
}

function identityPayload(record) {
  return {
    kind: record.kind,
    event: record.event,
    result: record.result,
    observation: record.observation,
    source: record.source,
    subject: record.subject,
    environmentHash: record.environmentHash,
    quality: record.quality ?? defaultQuality(record.kind),
    run: record.run ?? null,
    artifacts: record.artifacts ?? [],
  };
}

function digestPayload(record) {
  const {
    digest: _digest,
    observedAt: _observedAt,
    ...payload
  } = record ?? {};
  return payload;
}

export function evidenceId(record) {
  return `EV-${hash(identityPayload(record)).slice(0, 24)}`;
}

export function evidenceDigest(record) {
  return hash(digestPayload(record));
}

export function evidenceIntegrity(record) {
  if (!record?.digest) {
    return { valid: true, legacy: true, expected: null, actual: null };
  }
  const expected = evidenceDigest(record);
  return {
    valid: expected === record.digest,
    legacy: false,
    expected,
    actual: record.digest,
  };
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
  return hash(environment ?? {});
}

export function normalizeEvidence(input = {}) {
  const kind = input.kind ?? 'asserted';
  if (!TRUST.has(kind)) throw new Error('evidence kind must be asserted, observed or attested');

  const quality = input.quality ?? defaultQuality(kind);
  if (!QUALITY.has(quality)) throw new Error(`invalid evidence quality: ${quality}`);

  const environment = input.environment ?? {};
  const record = {
    schemaVersion: 1,
    kind,
    quality,
    event: input.event ?? null,
    result: input.result ?? null,
    observation: input.observation ?? null,
    source: input.source ?? null,
    subject: {
      commit: input.commit ?? input.subject?.commit ?? null,
      tree: input.tree ?? input.subject?.tree ?? null,
    },
    run: normalizeRun(input.run),
    artifacts: normalizeArtifacts(input.artifacts ?? []),
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

  const id = evidenceId(record);
  if (input.id && input.id !== id) throw new Error('evidence id does not match payload');
  record.id = id;

  const digest = evidenceDigest(record);
  if (input.digest && input.digest !== digest) throw new Error('evidence digest does not match payload');
  record.digest = digest;
  return record;
}

export function evidenceTrust(kind) {
  return kind === 'attested' ? 2 : kind === 'observed' ? 1 : 0;
}

export function evidenceIsPositive(record) {
  if (record?.result === true) return true;
  return POSITIVE.has(String(record?.result ?? '').toLowerCase());
}

export function evidenceIsAdmissible(record) {
  if (evidenceTrust(record?.kind) < 1) return false;
  if (!evidenceIsPositive(record)) return false;
  if (!evidenceIntegrity(record).valid) return false;
  const quality = record?.quality ?? defaultQuality(record?.kind);
  return ADMISSIBLE_QUALITY.has(quality);
}

export function trustedEvidenceForTree(evidence = [], tree) {
  return evidence.filter((record) =>
    evidenceTrust(record.kind) >= 1 &&
    record.subject?.tree === tree);
}

export function supportingEvidenceForTree(evidence = [], tree) {
  return trustedEvidenceForTree(evidence, tree).filter(evidenceIsAdmissible);
}
