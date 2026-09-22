import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { normalizeBatchPlan } from './batch.mjs';
import {
  environmentSnapshot,
  normalizeEvidence,
  supportingEvidenceForTree,
} from './evidence.mjs';
import { git, tryGit } from './git.mjs';
import { normalizeResources } from './resource.mjs';
import {
  awaitWorkState,
  compactWorkOverview,
  createWorkState,
  escalateWorkState,
  finishWorkState,
  recordEvidenceState,
  resumeWorkState,
} from './work-state.mjs';

const PREFIX = 'refs/usegit/work/';

function refFor(id) {
  if (!/^WORK-[A-Za-z0-9._-]+$/.test(id)) throw new Error('invalid work id: ' + id);
  return PREFIX + id;
}

function defaultOwner() {
  if (process.env.USEGIT_AGENT_ID) return process.env.USEGIT_AGENT_ID;
  const user = process.env.USER ?? process.env.USERNAME ?? 'user';
  return 'local:' + user + '@' + os.hostname();
}

function hasRemote(remote = 'origin') {
  return Boolean(tryGit(['remote', 'get-url', remote]));
}

export function syncWorkRefs(remote = 'origin') {
  if (!hasRemote(remote)) return { remote: null, synced: false };
  tryGit(['fetch', remote, '+' + PREFIX + '*:' + PREFIX + '*']);
  return { remote, synced: true };
}

function refEntries() {
  const output = tryGit(['for-each-ref', '--format=%(refname) %(objectname)', PREFIX]);
  if (!output.trim()) return [];
  return output.split('\n').filter(Boolean).map((line) => {
    const space = line.lastIndexOf(' ');
    return { ref: line.slice(0, space), commit: line.slice(space + 1) };
  });
}

function readStateFromRef(ref) {
  return JSON.parse(git(['show', ref + ':work.json']));
}

export function listWorkStates({ sync = false, remote = 'origin' } = {}) {
  if (sync) syncWorkRefs(remote);
  return refEntries()
    .map(({ ref, commit }) => ({ ...readStateFromRef(ref), stateCommit: commit }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function writeState(state, expectedCommit = null) {
  const content = JSON.stringify(state, null, 2) + '\n';
  const blob = git(['hash-object', '-w', '--stdin'], { input: content });
  const tree = git(['mktree'], { input: '100644 blob ' + blob + '\twork.json\n' });

  const args = ['commit-tree', tree, '-m', 'usegit-work: ' + state.id + ' ' + state.status];
  if (expectedCommit) args.push('-p', expectedCommit);
  const commit = git(args, {
    env: {
      GIT_AUTHOR_NAME: 'usegit',
      GIT_AUTHOR_EMAIL: 'usegit@local',
      GIT_COMMITTER_NAME: 'usegit',
      GIT_COMMITTER_EMAIL: 'usegit@local',
    },
  });

  const ref = refFor(state.id);
  if (expectedCommit) {
    git(['update-ref', ref, commit, expectedCommit]);
  } else {
    if (tryGit(['rev-parse', '--verify', ref])) throw new Error(state.id + ' already exists');
    git(['update-ref', ref, commit]);
  }

  return { ref, commit };
}

function pushState(ref, commit, previousCommit, remote = 'origin') {
  if (!hasRemote(remote)) return { durability: 'local', remote: null };

  try {
    git(['push', remote, ref + ':' + ref]);
    return { durability: 'remote', remote };
  } catch (error) {
    if (previousCommit) tryGit(['update-ref', ref, previousCommit, commit]);
    else tryGit(['update-ref', '-d', ref, commit]);
    throw new Error('failed to publish ' + ref + '; remote state moved or push was rejected', { cause: error });
  }
}

function persist(state, previousCommit = null, remote = 'origin') {
  const { ref, commit } = writeState(state, previousCommit);
  return { ...state, stateCommit: commit, ...pushState(ref, commit, previousCommit, remote) };
}

function current(id) {
  const ref = refFor(id);
  const commit = tryGit(['rev-parse', '--verify', ref]);
  if (!commit) throw new Error('unknown work: ' + id);
  return { state: readStateFromRef(ref), commit };
}

function gitSubject() {
  const commit = git(['rev-parse', 'HEAD']);
  const tree = git(['rev-parse', 'HEAD^{tree}']);
  return { commit, tree };
}

function generatedId() {
  return 'WORK-' + randomUUID().slice(0, 8).toUpperCase();
}

function stableSpec(state) {
  return JSON.stringify({
    goal: state.goal,
    batchId: state.batchId ?? null,
    priority: state.priority ?? 0,
    dependsOn: state.dependsOn ?? [],
    scopes: state.scopes ?? [],
    resources: normalizeResources(state.resources ?? []),
  });
}

function buildEvidence({
  kind = 'asserted',
  event = null,
  result = null,
  observation = null,
  source = null,
  environment = null,
  quality = null,
  run = null,
} = {}) {
  const subject = gitSubject();
  return normalizeEvidence({
    kind,
    event,
    result,
    observation,
    source,
    quality,
    run,
    commit: subject.commit,
    tree: subject.tree,
    environment: {
      ...environmentSnapshot(),
      ...(environment ? { label: environment } : {}),
    },
  });
}

function createWork({
  id = generatedId(),
  goal,
  scopes = [],
  resources = [],
  batchId = null,
  priority = 0,
  dependsOn = [],
  owner = defaultOwner(),
  leaseMinutes = 30,
  ready = false,
  remote = 'origin',
} = {}) {
  syncWorkRefs(remote);
  if (tryGit(['rev-parse', '--verify', refFor(id)])) throw new Error(id + ' already exists');

  const subject = gitSubject();
  const state = createWorkState({
    id,
    goal,
    scopes,
    resources,
    batchId,
    priority,
    dependsOn,
    base: subject.commit,
    baseTree: subject.tree,
    owner,
    ready,
    leaseMs: Number(leaseMinutes) * 60_000,
  });

  return persist(state, null, remote);
}

export function startWork(options = {}) {
  return createWork({ ...options, ready: false });
}

export function enqueueWork(options = {}) {
  return createWork({ ...options, ready: true });
}

export function createWorkBatch(plan, {
  owner = defaultOwner(),
  remote = 'origin',
  leaseMinutes = 30,
} = {}) {
  const batch = normalizeBatchPlan(plan);
  const existing = new Map(listWorkStates({ sync: true, remote }).map((state) => [state.id, state]));
  const planIds = new Set(batch.work.map((item) => item.id));
  const available = new Set([...existing.keys(), ...planIds]);

  for (const item of batch.work) {
    for (const dependency of item.dependsOn) {
      if (!available.has(dependency)) throw new Error(item.id + ' depends on unknown work ' + dependency);
      if (dependency === item.id) throw new Error(item.id + ' cannot depend on itself');
    }
  }

  const created = [];
  const skipped = [];

  for (const item of batch.work) {
    const prior = existing.get(item.id);
    if (prior) {
      const expected = createWorkState({
        ...item,
        batchId: batch.id,
        base: prior.base,
        baseTree: prior.baseTree ?? null,
        owner: prior.createdBy ?? owner,
        ready: true,
        now: Date.parse(prior.createdAt),
        leaseMs: Number(leaseMinutes) * 60_000,
      });
      if (stableSpec(prior) !== stableSpec(expected)) {
        throw new Error(item.id + ' already exists with a different specification');
      }
      skipped.push(item.id);
      continue;
    }

    const state = enqueueWork({
      ...item,
      batchId: batch.id,
      owner,
      leaseMinutes,
      remote,
    });
    created.push(state.id);
    existing.set(state.id, state);
  }

  return {
    batchId: batch.id,
    created,
    skipped,
    queue: workStatus({ sync: true, remote }),
  };
}

export function awaitWork(id, {
  event,
  owner = defaultOwner(),
  onSuccess = null,
  onFailure = null,
  remote = 'origin',
} = {}) {
  syncWorkRefs(remote);
  const { state, commit } = current(id);
  return persist(awaitWorkState(state, { owner, event, onSuccess, onFailure }), commit, remote);
}

export function escalateWork(id, {
  reason,
  owner = defaultOwner(),
  remote = 'origin',
} = {}) {
  syncWorkRefs(remote);
  const { state, commit } = current(id);
  return persist(escalateWorkState(state, { owner, reason }), commit, remote);
}

export function claimWork(id, {
  owner = defaultOwner(),
  leaseMinutes = 30,
  remote = 'origin',
} = {}) {
  const overview = workStatus({ sync: true, remote });
  const ready = overview.workerReady.find((row) => row.id === id);
  if (!ready) {
    const blocked = overview.queueBlocked.find((row) => row.id === id);
    if (blocked) throw new Error(id + ' is queue-blocked: ' + JSON.stringify(blocked.blockedBy));
    throw new Error(id + ' is not worker-ready');
  }

  const { state, commit } = current(id);
  return persist(resumeWorkState(state, {
    owner,
    leaseMs: Number(leaseMinutes) * 60_000,
  }), commit, remote);
}

export function claimNextWork({
  owner = defaultOwner(),
  leaseMinutes = 30,
  remote = 'origin',
  retries = 8,
} = {}) {
  let lastError = null;

  for (let attempt = 0; attempt < retries; attempt += 1) {
    const overview = workStatus({ sync: true, remote });
    const candidate = overview.workerReady[0];

    if (!candidate) {
      return {
        claimed: null,
        workerReady: 0,
        queueBlocked: overview.queueBlocked.map((row) => ({
          id: row.id,
          blockedBy: row.blockedBy,
        })),
      };
    }

    try {
      const claimed = claimWork(candidate.id, { owner, leaseMinutes, remote });
      return { claimed, attempt: attempt + 1 };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    'could not claim worker-ready work after ' + retries + ' attempts: ' + (lastError?.message ?? 'unknown race'),
  );
}

export function recordWorkEvidence(id, {
  kind = 'asserted',
  result = null,
  observation = null,
  source = null,
  environment = null,
  event = null,
  quality = null,
  run = null,
  owner = defaultOwner(),
  remote = 'origin',
} = {}) {
  syncWorkRefs(remote);
  const { state, commit } = current(id);
  const evidence = buildEvidence({
    kind,
    result,
    observation,
    source,
    environment,
    event,
    quality,
    run,
  });
  const next = recordEvidenceState(state, { owner, evidence });
  if (next === state) {
    const remoteDurable = hasRemote(remote);
    return {
      ...state,
      stateCommit: commit,
      duplicateEvidence: true,
      durability: remoteDurable ? 'remote' : 'local',
      remote: remoteDurable ? remote : null,
    };
  }
  return persist(next, commit, remote);
}

export function resumeWork(id, {
  result = null,
  evidence = null,
  evidenceKind = 'asserted',
  evidenceSource = null,
  evidenceEnvironment = null,
  evidenceQuality = null,
  evidenceRun = null,
  owner = defaultOwner(),
  leaseMinutes = 30,
  remote = 'origin',
} = {}) {
  syncWorkRefs(remote);
  const { state, commit } = current(id);
  const record = evidence || result ? buildEvidence({
    kind: evidenceKind,
    event: state.awaiting?.event ?? null,
    result,
    observation: evidence,
    source: evidenceSource,
    environment: evidenceEnvironment,
    quality: evidenceQuality,
    run: evidenceRun,
  }) : null;

  return persist(resumeWorkState(state, {
    owner,
    result,
    evidence: record,
    leaseMs: Number(leaseMinutes) * 60_000,
  }), commit, remote);
}

export function finishWork(id, {
  decision = 'accepted',
  summary = null,
  owner = defaultOwner(),
  remote = 'origin',
} = {}) {
  syncWorkRefs(remote);
  const { state, commit } = current(id);
  const subject = gitSubject();

  if (decision === 'accepted') {
    const supporting = supportingEvidenceForTree(state.evidence ?? [], subject.tree);
    if (!supporting.length) {
      throw new Error(
        id + ' cannot be accepted: no observed/attested successful evidence for current tree ' + subject.tree,
      );
    }
  }

  return persist(finishWorkState(state, {
    owner,
    decision,
    summary,
    subject,
  }), commit, remote);
}

export function workStatus({ sync = true, remote = 'origin' } = {}) {
  return compactWorkOverview(listWorkStates({ sync, remote }));
}
