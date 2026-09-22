import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { git, tryGit } from './git.mjs';
import {
  awaitWorkState,
  compactWorkOverview,
  createWorkState,
  finishWorkState,
  resumeWorkState,
} from './work-state.mjs';

const PREFIX = 'refs/usegit/work/';

function refFor(id) {
  if (!/^WORK-[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error(`invalid work id: ${id}`);
  }
  return `${PREFIX}${id}`;
}

function defaultOwner() {
  if (process.env.USEGIT_AGENT_ID) return process.env.USEGIT_AGENT_ID;
  const user = process.env.USER ?? process.env.USERNAME ?? 'user';
  return `local:${user}@${os.hostname()}`;
}

function hasRemote(remote = 'origin') {
  return Boolean(tryGit(['remote', 'get-url', remote]));
}

export function syncWorkRefs(remote = 'origin') {
  if (!hasRemote(remote)) return { remote: null, synced: false };
  tryGit(['fetch', remote, `+${PREFIX}*:${PREFIX}*`]);
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
  return JSON.parse(git(['show', `${ref}:work.json`]));
}

export function listWorkStates({ sync = false, remote = 'origin' } = {}) {
  if (sync) syncWorkRefs(remote);
  return refEntries()
    .map(({ ref, commit }) => ({ ...readStateFromRef(ref), stateCommit: commit }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function writeState(state, expectedCommit = null) {
  const content = `${JSON.stringify(state, null, 2)}\n`;
  const blob = git(['hash-object', '-w', '--stdin'], { input: content });
  const tree = git(['mktree'], { input: `100644 blob ${blob}\twork.json\n` });

  const args = ['commit-tree', tree, '-m', `usegit-work: ${state.id} ${state.status}`];
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
    if (tryGit(['rev-parse', '--verify', ref])) throw new Error(`${state.id} already exists`);
    git(['update-ref', ref, commit]);
  }

  return { ref, commit };
}

function pushState(ref, commit, previousCommit, remote = 'origin') {
  if (!hasRemote(remote)) return { durability: 'local', remote: null };

  try {
    git(['push', remote, `${ref}:${ref}`]);
    return { durability: 'remote', remote };
  } catch (error) {
    if (previousCommit) {
      tryGit(['update-ref', ref, previousCommit, commit]);
    } else {
      tryGit(['update-ref', '-d', ref, commit]);
    }
    throw new Error(`failed to publish ${ref}; remote state moved or push was rejected`, { cause: error });
  }
}

function persist(state, previousCommit = null, remote = 'origin') {
  const { ref, commit } = writeState(state, previousCommit);
  return { ...state, stateCommit: commit, ...pushState(ref, commit, previousCommit, remote) };
}

function current(id) {
  const ref = refFor(id);
  const commit = tryGit(['rev-parse', '--verify', ref]);
  if (!commit) throw new Error(`unknown work: ${id}`);
  return { state: readStateFromRef(ref), commit };
}

function generatedId() {
  return `WORK-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export function startWork({
  id = generatedId(),
  goal,
  hypothesis,
  experiment = null,
  owner = defaultOwner(),
  leaseMinutes = 30,
  remote = 'origin',
} = {}) {
  syncWorkRefs(remote);
  if (tryGit(['rev-parse', '--verify', refFor(id)])) throw new Error(`${id} already exists`);

  const state = createWorkState({
    id,
    goal,
    hypothesis,
    experiment,
    base: git(['rev-parse', 'HEAD']),
    owner,
    leaseMs: Number(leaseMinutes) * 60_000,
  });

  return persist(state, null, remote);
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

export function resumeWork(id, {
  result = null,
  evidence = null,
  owner = defaultOwner(),
  leaseMinutes = 30,
  remote = 'origin',
} = {}) {
  syncWorkRefs(remote);
  const { state, commit } = current(id);
  return persist(resumeWorkState(state, {
    owner,
    result,
    evidence,
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
  return persist(finishWorkState(state, { owner, decision, summary }), commit, remote);
}

export function workStatus({ sync = true, remote = 'origin' } = {}) {
  return compactWorkOverview(listWorkStates({ sync, remote }));
}
