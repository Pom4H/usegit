function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function evaluatePlan(plan) {
  const changes = Array.isArray(plan.changes) ? plan.changes : [];
  const units = unique(changes.map((x) => x.causalUnit));
  const unassigned = changes.filter((x) => !x.causalUnit).map((x) => x.path);
  const totalLines = changes.reduce((sum, x) => sum + (x.lines ?? 0), 0);
  const groups = units.map((unit) => ({
    causalUnit: unit,
    paths: changes.filter((x) => x.causalUnit === unit).map((x) => x.path),
    lines: changes.filter((x) => x.causalUnit === unit).reduce((sum, x) => sum + (x.lines ?? 0), 0),
  }));

  let recommendation = 'keep';
  const reasons = [];

  if (unassigned.length) {
    recommendation = 'clarify';
    reasons.push(`${unassigned.length} change(s) have no causal unit`);
  } else if (groups.length > 1) {
    recommendation = 'split';
    reasons.push(`${groups.length} independently falsifiable causal units are mixed`);
  } else {
    reasons.push('all changes support one causal unit');
  }

  if (totalLines > 800) {
    reasons.push(`${totalLines} changed lines is a warning that the causal unit may be underspecified`);
  }

  return {
    policy: 'dynamic',
    recommendation,
    totalLines,
    groups,
    reasons,
    invariant: 'split by independent causal claim; size is only a warning signal',
  };
}
