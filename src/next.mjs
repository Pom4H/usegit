export function nextExperiment(report) {
  if (report.validationErrors.length) {
    return {
      kind: 'repair-metadata',
      hypothesis: 'Repairing missing causal metadata restores a complete design-time history.',
      reason: report.validationErrors[0],
    };
  }

  const target = Object.entries(report.strategies)
    .sort((a, b) => a[1].samples - b[1].samples)[0];

  if (target && target[1].samples < 3) {
    return {
      kind: 'collect-granularity-evidence',
      strategy: target[0],
      hypothesis: `A ${target[0]} commit boundary improves causal reconstruction enough to justify its coordination cost.`,
      reason: `Only ${target[1].samples} sample(s); collect at least 3 before comparing policies.`,
    };
  }

  const replay = report.granularityReplay;
  if (replay?.sampleReady && !replay.complete) {
    const needs = Object.entries(replay.completedRuns)
      .filter(([, count]) => count < replay.requiredRunsPerVariant)
      .map(([strategy]) => strategy);

    return {
      kind: 'run-controlled-granularity-replay',
      benchmark: replay.benchmarkId,
      strategies: needs,
      hypothesis: 'Paired replay on identical final trees can separate history quality from task complexity.',
      reason: 'Observational granularity samples are confounded; controlled replay is required before selecting a policy.',
    };
  }

  if (report.unresolvedExperiments.length) {
    return {
      kind: 'resolve-oldest-experiment',
      experiment: report.unresolvedExperiments[0],
      hypothesis: 'The oldest unresolved experiment currently carries the highest context-loss risk.',
      reason: 'Unresolved causal claims accumulate ambiguity for future agents.',
    };
  }

  return {
    kind: 'challenge-the-protocol',
    hypothesis: 'The current report is missing a metric that would change the next decision.',
    reason: 'All tracked experiments are resolved; improve the measurement model before adding process.',
  };
}
