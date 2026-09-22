function reduction(naive, actual) {
  if (!naive) return 0;
  return Number(((naive - actual) / naive).toFixed(4));
}

export function decideIntegration(plan) {
  const work = plan?.work;
  if (!Array.isArray(work) || work.length === 0) {
    throw new Error('integration plan requires at least one work item');
  }

  const ids = work.map((item) => item.id);
  if (ids.some((id) => typeof id !== 'string' || id.length === 0)) {
    throw new Error('every work item requires a non-empty id');
  }
  if (new Set(ids).size !== ids.length) {
    throw new Error('work item ids must be unique');
  }

  const naivePrCount = work.length;
  const unfinished = work.filter((item) => item.status !== 'accepted').map((item) => item.id);
  const conflicts = Array.isArray(plan.conflicts) ? plan.conflicts : [];

  const base = {
    integrationSet: ids,
    naivePrCount,
  };

  if (unfinished.length) {
    return {
      ...base,
      kind: 'wait',
      recommendedPrCount: 0,
      prReductionRatio: 1,
      unfinished,
      reason: 'PR creation is premature until every work item in the integration set has accepted evidence.',
    };
  }

  if (conflicts.length) {
    return {
      ...base,
      kind: 'resolve-conflicts',
      recommendedPrCount: 0,
      prReductionRatio: 1,
      conflicts,
      reason: 'Resolve compatibility before choosing an integration boundary.',
    };
  }

  const boundaries = plan.boundaries ?? {};
  const boundaryReasons = [
    ['humanReview', 'human-review'],
    ['protectedTarget', 'protected-target'],
    ['release', 'release-boundary'],
    ['externalContributor', 'external-contributor'],
  ]
    .filter(([field]) => boundaries[field] === true)
    .map(([, reason]) => reason);

  const recommendedPrCount = boundaryReasons.length ? 1 : 0;

  return {
    ...base,
    kind: recommendedPrCount ? 'pr' : 'direct-merge',
    recommendedPrCount,
    prReductionRatio: reduction(naivePrCount, recommendedPrCount),
    boundaryReasons,
    reason: recommendedPrCount
      ? 'Create one PR for the validated integration set because a real review/trust/release boundary exists.'
      : 'No PR is needed: integrate the accepted, compatible work set directly after final validation.',
  };
}
