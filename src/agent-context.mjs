import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { compactCausalHistory } from './context.mjs';
import { git } from './git.mjs';
import { history } from './metadata.mjs';
import { nextExperiment } from './next.mjs';
import { buildReport } from './report.mjs';
import { workStatus } from './work.mjs';

const CACHE_DIR = 'usegit';
const CACHE_FILE = 'AGENTS.md';
const TICK = String.fromCharCode(96);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function compactWorkRow(row) {
  return {
    id: row.id,
    status: row.status,
    goal: row.goal,
    experiment: row.experiment ?? null,
    priority: row.priority ?? 0,
    dependsOn: row.dependsOn ?? [],
    scopes: row.scopes ?? [],
    resources: row.resources ?? [],
    contract: row.contract ?? {},
    owner: row.owner ?? null,
    leaseExpiresAt: row.leaseExpiresAt ?? null,
    awaiting: row.awaiting ?? null,
    continuation: row.continuation ?? null,
    escalation: row.escalation ?? null,
    evidenceCount: row.evidenceCount ?? 0,
    decision: row.decision ?? null,
    route: row.route?.lane ?? null,
  };
}

function compactGroup(rows = []) {
  return rows.map(compactWorkRow);
}

function loadRunningExperiments(dir = 'experiments') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')))
    .filter((experiment) => experiment.status === 'running')
    .map((experiment) => ({
      id: experiment.id,
      question: experiment.question ?? null,
      hypothesis: experiment.hypothesis ?? null,
      status: experiment.status,
    }));
}

export function compactNegativeKnowledge(commits, limit = 8) {
  const active = new Map();

  for (const commit of [...commits].reverse()) {
    const metadata = commit.metadata ?? {};
    const hypothesis = metadata.hypothesis;
    if (!hypothesis) continue;

    if (metadata.conditionsChanged === 'true') active.delete(hypothesis);

    if (metadata.decision === 'falsified' || metadata.decision === 'rejected') {
      active.set(hypothesis, {
        hypothesis,
        decision: metadata.decision,
        changeId: metadata.changeId ?? null,
        experiment: metadata.experiment ?? null,
        sha: commit.sha.slice(0, 12),
      });
    }
  }

  return [...active.values()].slice(-limit).reverse();
}

export function buildAgentContextModel({ sync = true, remote = 'origin' } = {}) {
  const commits = history(40);
  const report = buildReport();
  const work = workStatus({ sync, remote });

  return {
    schemaVersion: 1,
    head: commits[0]?.sha ?? null,
    work: {
      workerReady: compactGroup(work.workerReady),
      queueBlocked: compactGroup(work.queueBlocked),
      controlQueue: compactGroup(work.controlQueue),
      active: compactGroup(work.active),
      awaiting: compactGroup(work.awaiting),
      stale: compactGroup(work.stale),
      conflicts: work.conflicts ?? [],
    },
    experiments: loadRunningExperiments(),
    negativeKnowledge: compactNegativeKnowledge(commits),
    recentCausalHistory: compactCausalHistory(commits, 8),
    next: nextExperiment(report),
  };
}

export function agentContextFingerprint(model) {
  return sha256(JSON.stringify(stable(model)));
}

function printable(value) {
  if (value === null || value === undefined || value === '') return 'none';
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'none';
  return String(value);
}

function resourceList(resources = []) {
  return resources.map((resource) => resource.name + ':' + resource.access).join(',');
}

function renderWorkGroup(title, rows) {
  const lines = ['### ' + title + ' (' + rows.length + ')'];
  if (!rows.length) return lines.concat(['- none', '']);

  for (const row of rows) {
    const details = [
      row.experiment ? 'experiment=' + row.experiment : null,
      row.priority ? 'priority=' + row.priority : null,
      row.dependsOn?.length ? 'dependsOn=' + row.dependsOn.join(',') : null,
      row.scopes?.length ? 'scopes=' + row.scopes.join(',') : null,
      row.resources?.length ? 'resources=' + resourceList(row.resources) : null,
      row.contract?.success ? 'success=' + row.contract.success : null,
      row.contract?.evidence ? 'evidencePlan=' + row.contract.evidence : null,
      row.owner ? 'owner=' + row.owner : null,
      row.leaseExpiresAt ? 'leaseUntil=' + row.leaseExpiresAt : null,
      row.awaiting ? 'awaiting=' + row.awaiting : null,
      row.continuation ? 'continuation=' + row.continuation : null,
      row.escalation ? 'escalation=' + row.escalation : null,
      row.evidenceCount ? 'evidence=' + row.evidenceCount : null,
      row.decision ? 'decision=' + printable(row.decision?.outcome ?? row.decision) : null,
      row.route ? 'route=' + row.route : null,
    ].filter(Boolean);

    lines.push(
      '- ' + TICK + row.id + TICK + ' [' + row.status + '] ' +
      (row.goal ?? 'untitled') +
      (details.length ? ' — ' + details.join(' · ') : ''),
    );
  }

  lines.push('');
  return lines;
}

function renderIndentedJson(value) {
  return JSON.stringify(value, null, 2)
    .split('\n')
    .map((line) => '    ' + line);
}

function collectScalarValues(value, output) {
  if (value === null || value === undefined || value === '') return;
  if (Array.isArray(value)) {
    for (const item of value) collectScalarValues(item, output);
    return;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) collectScalarValues(item, output);
    return;
  }
  output.push(String(value));
}

export function decisionCriticalTokens(model) {
  const tokens = [];
  collectScalarValues(model.head, tokens);

  const groups = [
    model.work.workerReady,
    model.work.queueBlocked,
    model.work.controlQueue,
    model.work.active,
    model.work.awaiting,
    model.work.stale,
  ];

  for (const rows of groups) {
    for (const row of rows) {
      collectScalarValues(row.id, tokens);
      collectScalarValues(row.status, tokens);
      collectScalarValues(row.goal, tokens);
      collectScalarValues(row.experiment, tokens);
      if (row.priority) collectScalarValues(row.priority, tokens);
      collectScalarValues(row.dependsOn, tokens);
      collectScalarValues(row.scopes, tokens);
      collectScalarValues(row.resources, tokens);
      collectScalarValues(row.contract?.success, tokens);
      collectScalarValues(row.contract?.evidence, tokens);
      collectScalarValues(row.owner, tokens);
      collectScalarValues(row.leaseExpiresAt, tokens);
      collectScalarValues(row.awaiting, tokens);
      collectScalarValues(row.continuation, tokens);
      collectScalarValues(row.escalation, tokens);
      if (row.evidenceCount) collectScalarValues(row.evidenceCount, tokens);
      collectScalarValues(row.decision?.outcome ?? row.decision, tokens);
      collectScalarValues(row.route, tokens);
    }
  }

  collectScalarValues(model.work.conflicts, tokens);

  for (const experiment of model.experiments) {
    collectScalarValues(experiment.id, tokens);
    collectScalarValues(experiment.hypothesis, tokens);
  }

  for (const item of model.negativeKnowledge ?? []) {
    collectScalarValues(item.hypothesis, tokens);
    collectScalarValues(item.decision, tokens);
    collectScalarValues(item.changeId, tokens);
    collectScalarValues(item.experiment, tokens);
  }

  for (const change of model.recentCausalHistory) {
    collectScalarValues(change.changeId, tokens);
    collectScalarValues(change.experiment, tokens);
    collectScalarValues(change.intent, tokens);
    collectScalarValues(change.hypothesis, tokens);
    collectScalarValues(change.granularity, tokens);
    collectScalarValues(change.decision, tokens);
  }

  collectScalarValues(model.next, tokens);
  return [...new Set(tokens)];
}

export function agentContextCriticalFieldRecall(model, markdown) {
  const tokens = decisionCriticalTokens(model);
  if (!tokens.length) return 1;
  const preserved = tokens.filter((token) => markdown.includes(token)).length;
  return preserved / tokens.length;
}

export function renderAgentContext(model) {
  const fingerprint = agentContextFingerprint(model);
  const lines = [
    '# Compiled agent context',
    '',
    '<!-- usegit:context-fingerprint ' + fingerprint + ' -->',
    '',
    '> Session-local prompt cache compiled from Git, WORK refs and experiment records. It is disposable and is never source of truth.',
    '',
    'Head: ' + TICK + (model.head ?? 'none') + TICK,
    'Fingerprint: ' + TICK + fingerprint + TICK,
    '',
    '## Current work',
    '',
    ...renderWorkGroup('Worker ready', model.work.workerReady),
    ...renderWorkGroup('Queue blocked', model.work.queueBlocked),
    ...renderWorkGroup('Control queue', model.work.controlQueue),
    ...renderWorkGroup('Active', model.work.active),
    ...renderWorkGroup('Awaiting', model.work.awaiting),
    ...renderWorkGroup('Stale', model.work.stale),
    '### Conflicts',
  ];

  if (model.work.conflicts.length) lines.push(...renderIndentedJson(model.work.conflicts));
  else lines.push('- none');

  lines.push('', '## Running experiments', '');

  if (model.experiments.length) {
    for (const experiment of model.experiments) {
      lines.push('- **' + experiment.id + '** — ' + printable(experiment.hypothesis));
    }
  } else {
    lines.push('- none');
  }

  lines.push('', '## Active negative knowledge', '');

  if (model.negativeKnowledge?.length) {
    for (const item of model.negativeKnowledge) {
      lines.push(
        '- ' + TICK + printable(item.changeId) + TICK +
        ' · ' + printable(item.experiment) +
        ' · ' + printable(item.decision) +
        ' — ' + printable(item.hypothesis),
      );
    }
  } else {
    lines.push('- none');
  }

  lines.push('', '## Next decision', '', ...renderIndentedJson(model.next), '', '## Recent causal changes', '');

  if (model.recentCausalHistory.length) {
    for (const change of model.recentCausalHistory) {
      lines.push(
        '- ' + TICK + change.changeId + TICK +
        ' · ' + printable(change.experiment) +
        ' · ' + printable(change.decision) +
        ' · ' + printable(change.granularity) +
        ' · ' + printable(change.intent) +
        ' — ' + printable(change.hypothesis),
      );
    }
  } else {
    lines.push('- none');
  }

  lines.push(
    '',
    'If this projection conflicts with Git/WORK/evidence state, discard it and regenerate with ' +
      TICK + 'usegit agents' + TICK + '.',
    '',
  );

  return lines.join('\n');
}

export function compileAgentContext(options = {}) {
  const model = buildAgentContextModel(options);
  const markdown = renderAgentContext(model);
  return {
    model,
    markdown,
    fingerprint: agentContextFingerprint(model),
    bytes: Buffer.byteLength(markdown),
    criticalFieldRecall: agentContextCriticalFieldRecall(model, markdown),
  };
}

export function defaultAgentContextPath() {
  const raw = git(['rev-parse', '--git-dir']);
  const gitDir = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
  return path.join(gitDir, CACHE_DIR, CACHE_FILE);
}

export function writeAgentContext({ output = null, ...options } = {}) {
  const compiled = compileAgentContext(options);
  const file = output ? path.resolve(output) : defaultAgentContextPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (previous !== compiled.markdown) fs.writeFileSync(file, compiled.markdown);

  return {
    path: file,
    fingerprint: compiled.fingerprint,
    bytes: compiled.bytes,
    criticalFieldRecall: compiled.criticalFieldRecall,
    status: previous === compiled.markdown ? 'unchanged' : previous === null ? 'created' : 'updated',
  };
}

export function checkAgentContext({ output = null, ...options } = {}) {
  const compiled = compileAgentContext(options);
  const file = output ? path.resolve(output) : defaultAgentContextPath();
  const actual = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  return {
    path: file,
    fingerprint: compiled.fingerprint,
    bytes: compiled.bytes,
    criticalFieldRecall: compiled.criticalFieldRecall,
    exists: actual !== null,
    fresh: actual === compiled.markdown,
  };
}
