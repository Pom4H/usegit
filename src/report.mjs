import fs from 'node:fs';
import path from 'node:path';
import { commitStats, tryGit } from './git.mjs';
import { history, validationErrors } from './metadata.mjs';
import { findRepeatedFalsifiedHypotheses } from './negative.mjs';
import { compactCausalHistory, criticalFieldRecall } from './context.mjs';

function median(values) {
  if (!values.length) return 0;
  const xs = [...values].sort((a, b) => a - b);
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function loadExperiments(dir = 'experiments') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
}

export function latestRevisionPerChange(samples) {
  const unique = new Map();
  for (const sample of samples) {
    const id = sample.metadata?.changeId;
    if (id && !unique.has(id)) unique.set(id, sample);
  }
  return [...unique.values()];
}

function replayState(experiments, strategies) {
  const exp = experiments.find((x) => x.id === 'EXP-0002');
  const benchmark = exp?.controlledBenchmark;
  if (!benchmark) return null;

  const minimum = exp.minimumSamplesPerVariant ?? 0;
  const sampleReady = Object.values(strategies).every((x) => x.samples >= minimum);
  const required = benchmark.requiredReplayRunsPerVariant ?? 0;
  const results = Array.isArray(benchmark.results) ? benchmark.results : [];
  const completed = Object.fromEntries(['coarse', 'fine', 'dynamic'].map((strategy) => [
    strategy,
    results.filter((x) => x.strategy === strategy).length,
  ]));
  const complete = sampleReady && Object.values(completed).every((count) => count >= required);

  return {
    benchmarkId: benchmark.id,
    sampleReady,
    requiredRunsPerVariant: required,
    completedRuns: completed,
    complete,
    targetTree: benchmark.targetTree,
    branches: benchmark.branches,
  };
}

export function buildReport() {
  const commits = history();
  const structured = commits.filter((c) => c.metadata.changeId);
  const revisions = structured.map((commit) => ({ ...commit, stats: commitStats(commit.sha) }));
  const changes = latestRevisionPerChange(revisions);

  const strategyNames = ['coarse', 'fine', 'dynamic'];
  const strategies = Object.fromEntries(strategyNames.map((name) => {
    const xs = changes.filter((x) => x.metadata.granularity === name);
    const experiments = new Set(xs.map((x) => x.metadata.experiment).filter(Boolean));
    return [name, {
      samples: xs.length,
      experiments: experiments.size,
      medianLines: median(xs.map((x) => x.stats.lines)),
      medianFiles: median(xs.map((x) => x.stats.files)),
      pending: xs.filter((x) => x.metadata.decision === 'pending').length,
    }];
  }));

  const chronological = [...commits].reverse();
  const first = chronological.findIndex((c) => c.metadata.changeId);
  const relevant = first < 0 ? [] : chronological.slice(first).filter((c) => c.parents.length <= 1);
  const coverage = relevant.length ? relevant.filter((c) => c.metadata.changeId).length / relevant.length : 0;
  const experiments = loadExperiments();
  const repeated = findRepeatedFalsifiedHypotheses(structured);

  const packet = compactCausalHistory(commits);
  const rawPatch = tryGit(['log', '-20', '-p']);
  const rawBytes = Buffer.byteLength(rawPatch);
  const causalBytes = Buffer.byteLength(JSON.stringify(packet));
  const ratio = rawBytes ? causalBytes / rawBytes : 0;

  return {
    schemaVersion: 1,
    generatedFrom: commits[0]?.sha ?? null,
    structuredCommitCoverage: Number(coverage.toFixed(4)),
    structuredCommits: structured.length,
    uniqueChanges: changes.length,
    unresolvedExperiments: experiments.filter((x) => x.status === 'running').map((x) => x.id),
    repeatedFalsifiedHypotheses: repeated,
    repeatedFalsifiedHypothesisCount: repeated.length,
    contextCompression: {
      criticalFieldRecall: Number(criticalFieldRecall(commits, packet).toFixed(4)),
      causalContextBytes: causalBytes,
      rawPatchHistoryBytes: rawBytes,
      contextToRawByteRatio: Number(ratio.toFixed(4)),
    },
    strategies,
    granularityReplay: replayState(experiments, strategies),
    validationErrors: validationErrors(commits),
  };
}
