import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  evidenceIntegrity,
  evidenceIsAdmissible,
  evidenceIsPositive,
  evidenceTrust,
} from './evidence.mjs';
import { git } from './git.mjs';
import { history } from './metadata.mjs';
import { nextExperiment } from './next.mjs';
import { buildReport } from './report.mjs';
import { compactWorkOverview, effectiveWorkStatus } from './work-state.mjs';
import { listWorkStates } from './work.mjs';

const TERMINAL = new Set(['accepted', 'rejected', 'falsified']);
const DEFAULT_MAX_WORK = 32;
const HARD_MAX_WORK = 128;
const MAX_EVIDENCE = 8;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function ref(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = typeof value === 'string' ? value : JSON.stringify(stable(value));
  return { sha256: hash(raw), bytes: Buffer.byteLength(raw) };
}

function safe(value, pattern, prefix) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value);
  return pattern.test(text) ? text : prefix + '-' + hash(text).slice(0, 16);
}

const workId = (value) => safe(value, /^WORK-[A-Za-z0-9._-]+$/, 'WORK');
const expId = (value) => safe(value, /^EXP-[0-9]{4,}$/, 'EXP');
const changeId = (value) => safe(value, /^[A-Za-z0-9._-]+$/, 'CHANGE');
const gitId = (value) => safe(value, /^[0-9a-f]{7,64}$/i, 'GIT');

function enumValue(value, values) {
  return values.includes(value) ? value : 'unknown';
}

function subject() {
  return {
    commit: git(['rev-parse', 'HEAD']),
    tree: git(['rev-parse', 'HEAD^{tree}']),
  };
}

function maxWork(value) {
  const parsed = Number(value ?? DEFAULT_MAX_WORK);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_WORK;
  return Math.max(1, Math.min(HARD_MAX_WORK, Math.floor(parsed)));
}

function runningExperiments(dir = 'experiments') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')))
    .filter((item) => item.status === 'running');
}

function negativeRefs(commits, limit = 16) {
  const active = new Map();
  for (const commit of [...commits].reverse()) {
    const m = commit.metadata ?? {};
    if (!m.hypothesis) continue;
    if (m.conditionsChanged === 'true') active.delete(m.hypothesis);
    if (m.decision === 'rejected' || m.decision === 'falsified') {
      active.set(m.hypothesis, {
        hypothesis: m.hypothesis,
        decision: m.decision,
        changeId: m.changeId ?? null,
        experiment: m.experiment ?? null,
        sha: commit.sha,
        conditions: null,
      });
    }
  }
  return [...active.values()].slice(-limit).reverse();
}

function causalRefs(commits, limit = 12) {
  return commits
    .filter((commit) => commit.metadata?.changeId)
    .slice(0, limit)
    .map((commit) => ({
      sha: commit.sha,
      changeId: commit.metadata.changeId,
      experiment: commit.metadata.experiment ?? null,
      granularity: commit.metadata.granularity ?? null,
      decision: commit.metadata.decision ?? null,
      subject: commit.subject ?? null,
      intent: commit.metadata.intent ?? null,
      hypothesis: commit.metadata.hypothesis ?? null,
    }));
}

function evidenceRecord(record, currentTree) {
  const integrity = evidenceIntegrity(record);
  return {
    id: safe(record?.id ?? JSON.stringify(record), /^[A-Za-z0-9._-]+$/, 'EV'),
    kind: enumValue(record?.kind, ['asserted', 'observed', 'attested']),
    quality: enumValue(record?.quality, [
      'first-pass',
      'retry-pass',
      'quarantined',
      'flaky',
      'manual-attestation',
      'derived',
      'untrusted',
    ]),
    positive: evidenceIsPositive(record),
    trusted: evidenceTrust(record?.kind) >= 1,
    admissible: evidenceIsAdmissible(record),
    integrityValid: integrity.valid,
    legacyIntegrity: integrity.legacy,
    subjectTree: gitId(record?.subject?.tree),
    subjectMatchesCurrentTree: Boolean(currentTree && record?.subject?.tree === currentTree),
    sourceRef: ref(record?.source),
    runRef: ref(record?.run),
    observationRef: ref(record?.observation),
    resultRef: ref(record?.result),
  };
}

function evidenceSummary(work, currentTree) {
  const all = (work.evidence ?? []).map((item) => evidenceRecord(item, currentTree));
  const recent = all.slice(-MAX_EVIDENCE);
  return {
    total: all.length,
    omitted: Math.max(0, all.length - recent.length),
    trusted: all.filter((item) => item.trusted).length,
    admissible: all.filter((item) => item.admissible).length,
    currentTreeTrusted: all.filter((item) => item.trusted && item.subjectMatchesCurrentTree).length,
    currentTreeAdmissible: all.filter((item) => item.admissible && item.subjectMatchesCurrentTree).length,
    staleTree: all.filter((item) => item.subjectTree && !item.subjectMatchesCurrentTree).length,
    retryPass: all.filter((item) => item.quality === 'retry-pass').length,
    tampered: all.filter((item) => !item.integrityValid).length,
    semanticDigest: ref(all)?.sha256 ?? null,
    recent,
  };
}

function routeSummary(route = {}) {
  const signals = route.signals ?? {};
  return {
    lane: enumValue(route.lane, ['worker', 'control']),
    ready: Boolean(route.ready),
    reasoning: enumValue(route.reasoning, ['instant', 'deep']),
    blockers: [...new Set((route.blockers ?? []).map((item) =>
      /^[a-z0-9-]+$/.test(String(item)) ? String(item) : 'BLOCKER-' + hash(String(item)).slice(0, 16)
    ))].sort(),
    signals: {
      lane: enumValue(signals.lane, ['auto', 'worker', 'control']),
      uncertainty: enumValue(signals.uncertainty, ['low', 'medium', 'high']),
      oracle: enumValue(signals.oracle, ['objective', 'partial', 'none']),
      architectureDecision: Boolean(signals.architectureDecision),
      evidenceConflict: Boolean(signals.evidenceConflict),
      failedAttempts: Number.isInteger(signals.failedAttempts) ? signals.failedAttempts : 0,
    },
  };
}

function workEntry(work, current, currentAgentId) {
  const status = effectiveWorkStatus(work);
  const decision = work.decision ?? null;
  return {
    id: workId(work.id),
    stateCommit: gitId(work.stateCommit),
    stateDigest: ref(work)?.sha256 ?? null,
    status: enumValue(status, [
      'ready', 'active', 'awaiting', 'escalated', 'stale', 'accepted', 'rejected', 'falsified',
    ]),
    experiment: expId(work.experiment),
    priority: Number(work.priority ?? 0) || 0,
    dependsOn: (work.dependsOn ?? []).map(workId).sort(),
    base: gitId(work.base),
    baseTree: gitId(work.baseTree),
    applicability: {
      baseEqualsHead: Boolean(current?.commit && work.base === current.commit),
      baseTreeEqualsCurrentTree: Boolean(current?.tree && work.baseTree === current.tree),
    },
    route: routeSummary(work.route),
    lease: {
      present: Boolean(work.lease),
      ownedByCurrentAgent: Boolean(currentAgentId && work.lease?.owner === currentAgentId),
      ownerRef: ref(work.lease?.owner),
      expiresAt: work.lease?.expiresAt ?? null,
    },
    topology: {
      scopeCount: (work.scopes ?? []).length,
      scopeDigest: ref(work.scopes ?? [])?.sha256 ?? null,
      resourceCount: (work.resources ?? []).length,
      resourceDigest: ref(work.resources ?? [])?.sha256 ?? null,
    },
    content: {
      goalRef: ref(work.goal),
      hypothesisRef: ref(work.hypothesis),
      successCriterionRef: ref(work.contract?.success),
      evidencePlanRef: ref(work.contract?.evidence),
      awaitingEventRef: ref(work.awaiting?.event),
      continuationSuccessRef: ref(work.continuation?.success),
      continuationFailureRef: ref(work.continuation?.failure),
      selectedContinuationRef: ref(work.selectedContinuation),
      escalationReasonRef: ref(work.escalation?.reason),
      decisionSummaryRef: ref(decision?.summary),
    },
    evidence: evidenceSummary(work, current?.tree ?? null),
    decision: decision ? {
      outcome: enumValue(decision.outcome, ['accepted', 'rejected', 'falsified']),
      subjectCommit: gitId(decision.subject?.commit),
      subjectTree: gitId(decision.subject?.tree),
      at: decision.at ?? null,
    } : null,
  };
}

function experimentEntry(item) {
  return {
    id: expId(item.id),
    status: enumValue(item.status, ['running', 'accepted', 'rejected', 'falsified', 'completed']),
    questionRef: ref(item.question),
    hypothesisRef: ref(item.hypothesis),
    decisionRef: ref(item.decision),
  };
}

function negativeEntry(item) {
  const conditionsKnown = item.conditions !== null && item.conditions !== undefined;
  return {
    changeId: changeId(item.changeId),
    experiment: expId(item.experiment),
    decision: enumValue(item.decision, ['rejected', 'falsified']),
    commit: gitId(item.sha),
    hypothesisRef: ref(item.hypothesis),
    conditionsKnown,
    conditionsDigest: ref(item.conditions)?.sha256 ?? null,
    actionable: false,
  };
}

function causalEntry(item) {
  return {
    commit: gitId(item.sha),
    changeId: changeId(item.changeId),
    experiment: expId(item.experiment),
    granularity: enumValue(item.granularity, ['coarse', 'fine', 'dynamic']),
    decision: enumValue(item.decision, ['pending', 'accepted', 'rejected', 'falsified']),
    subjectRef: ref(item.subject),
    intentRef: ref(item.intent),
    hypothesisRef: ref(item.hypothesis),
  };
}

function nextEntry(next) {
  if (!next) return null;
  return {
    kind: /^[a-z0-9-]+$/.test(String(next.kind ?? ''))
      ? next.kind
      : 'NEXT-' + hash(String(next.kind)).slice(0, 16),
    experiment: expId(next.experiment),
    strategy: enumValue(next.strategy, ['coarse', 'fine', 'dynamic']),
    benchmarkRef: ref(next.benchmark),
    assignments: (next.assignments ?? []).map((item) => ({
      strategy: enumValue(item.strategy, ['coarse', 'fine', 'dynamic']),
      taskRef: ref(item.task),
      remaining: Number(item.remaining ?? 0) || 0,
    })),
    hypothesisRef: ref(next.hypothesis),
    reasonRef: ref(next.reason),
  };
}

function conflictEntry(item) {
  return {
    work: (item.work ?? []).map(workId).sort(),
    reason: /^[a-z0-9-]+$/.test(String(item.reason ?? ''))
      ? item.reason
      : 'CONFLICT-' + hash(String(item.reason)).slice(0, 16),
    overlapsDigest: ref(item.overlaps ?? [])?.sha256 ?? null,
  };
}

function orderedIds(overview) {
  const groups = [
    overview.workerReady ?? [],
    overview.controlQueue ?? [],
    overview.awaiting ?? [],
    overview.active ?? [],
    overview.escalated ?? [],
    overview.stale ?? [],
    overview.queueBlocked ?? [],
    overview.ready ?? [],
  ];
  const seen = new Set();
  const result = [];
  for (const group of groups) {
    for (const item of group) {
      if (!item.id || seen.has(item.id)) continue;
      seen.add(item.id);
      result.push(item.id);
    }
  }
  return result;
}

export function capsuleFingerprint(capsule) {
  const copy = { ...(capsule ?? {}) };
  delete copy.fingerprint;
  return hash(JSON.stringify(stable(copy)));
}

export function renderDecisionCapsule(capsule) {
  return JSON.stringify(stable(capsule), null, 2) + '\n';
}

export function decisionCapsuleFromState({
  subject: current,
  workStates = [],
  overview = null,
  experiments = [],
  negativeKnowledge = [],
  causalHistory = [],
  next = null,
  maxWork: requestedMaxWork = DEFAULT_MAX_WORK,
  currentAgentId = null,
} = {}) {
  const resolvedOverview = overview ?? compactWorkOverview(workStates);
  const limit = maxWork(requestedMaxWork);
  const live = workStates.filter((item) => !TERMINAL.has(effectiveWorkStatus(item)));
  const byId = new Map(live.map((item) => [item.id, item]));
  const ids = orderedIds(resolvedOverview).filter((id) => byId.has(id));
  for (const item of [...live].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!ids.includes(item.id)) ids.push(item.id);
  }

  const selected = ids.slice(0, limit).map((id) => byId.get(id));
  const omitted = Math.max(0, live.length - selected.length);

  const payload = {
    schemaVersion: 1,
    kind: 'usegit-decision-capsule',
    control: {
      arbitraryRepositoryTextInline: false,
      contentAccess: 'explicit-only',
      snapshotAuthoritativeForMutation: false,
      mutationsRequireResync: true,
      truncatedStateRequiresRefresh: true,
      negativeKnowledgeRequiresConditionsBeforeAction: true,
      maxWork: limit,
    },
    subject: {
      commit: gitId(current?.commit),
      tree: gitId(current?.tree),
    },
    freshness: {
      allWorkStateDigest: ref(
        workStates.map((item) => ({
          id: workId(item.id),
          stateCommit: gitId(item.stateCommit),
          status: effectiveWorkStatus(item),
          updatedAt: item.updatedAt ?? null,
        })).sort((a, b) => String(a.id).localeCompare(String(b.id))),
      )?.sha256 ?? null,
      remoteSyncRequiredBeforeMutation: true,
    },
    summary: {
      totalWorkStates: workStates.length,
      liveWorkStates: live.length,
      selectedWorkStates: selected.length,
      omittedWorkStates: omitted,
      truncated: omitted > 0,
      workerReady: (resolvedOverview.workerReady ?? []).length,
      queueBlocked: (resolvedOverview.queueBlocked ?? []).length,
      controlQueue: (resolvedOverview.controlQueue ?? []).length,
      active: (resolvedOverview.active ?? []).length,
      awaiting: (resolvedOverview.awaiting ?? []).length,
      stale: (resolvedOverview.stale ?? []).length,
      conflicts: (resolvedOverview.conflicts ?? []).length,
    },
    work: selected.map((item) => workEntry(item, current, currentAgentId)),
    conflicts: (resolvedOverview.conflicts ?? []).map(conflictEntry),
    experiments: experiments.map(experimentEntry),
    negativeKnowledge: negativeKnowledge.map(negativeEntry),
    causalHistory: causalHistory.map(causalEntry),
    next: nextEntry(next),
  };

  return { ...payload, fingerprint: capsuleFingerprint(payload) };
}

export function buildDecisionCapsule({
  sync = true,
  remote = 'origin',
  maxWork = DEFAULT_MAX_WORK,
  currentAgentId = process.env.USEGIT_AGENT_ID ?? null,
} = {}) {
  const states = listWorkStates({ sync, remote });
  const overview = compactWorkOverview(states);
  const commits = history(40);
  return decisionCapsuleFromState({
    subject: subject(),
    workStates: states,
    overview,
    experiments: runningExperiments(),
    negativeKnowledge: negativeRefs(commits),
    causalHistory: causalRefs(commits),
    next: nextExperiment(buildReport()),
    maxWork,
    currentAgentId,
  });
}

export function compileDecisionCapsule(options = {}) {
  const capsule = buildDecisionCapsule(options);
  const json = renderDecisionCapsule(capsule);
  return { capsule, json, bytes: Buffer.byteLength(json) };
}

const CONTENT = {
  goal: (work) => work.goal,
  hypothesis: (work) => work.hypothesis,
  'success-criterion': (work) => work.contract?.success,
  'evidence-plan': (work) => work.contract?.evidence,
  'awaiting-event': (work) => work.awaiting?.event,
  'continuation-success': (work) => work.continuation?.success,
  'continuation-failure': (work) => work.continuation?.failure,
  'selected-continuation': (work) => work.selectedContinuation,
  'escalation-reason': (work) => work.escalation?.reason,
  'decision-summary': (work) => work.decision?.summary,
};

export function readUntrustedWorkContent(id, field, {
  sync = true,
  remote = 'origin',
} = {}) {
  if (!CONTENT[field]) {
    throw new Error('content field must be one of: ' + Object.keys(CONTENT).join(', '));
  }
  const work = listWorkStates({ sync, remote }).find((item) => item.id === id);
  if (!work) throw new Error('unknown work: ' + id);
  const value = CONTENT[field](work);
  return {
    schemaVersion: 1,
    trust: 'untrusted-repository-content',
    instructionAuthority: 'none',
    workId: workId(work.id),
    field,
    contentRef: ref(value),
    value: value ?? null,
  };
}
