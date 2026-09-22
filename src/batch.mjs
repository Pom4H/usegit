function array(value, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function object(value, field) {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} must be an object`);
  return value;
}

export function normalizeBatchPlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new Error('batch plan must be an object');
  }
  if (!plan.id || typeof plan.id !== 'string') throw new Error('batch plan requires id');

  const items = array(plan.work, 'work');
  if (!items.length) throw new Error('batch plan requires at least one work item');
  if (items.length > 100) throw new Error('batch plan supports at most 100 work items');

  const defaults = object(plan.defaults, 'defaults');
  const ids = new Set();

  const work = items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`work[${index}] must be an object`);
    }
    if (!item.id || typeof item.id !== 'string') throw new Error(`work[${index}] requires id`);
    if (ids.has(item.id)) throw new Error(`duplicate work id: ${item.id}`);
    ids.add(item.id);

    const scopes = item.scopes ?? item.scope ?? defaults.scopes ?? defaults.scope ?? [];
    const normalizedScopes = Array.isArray(scopes)
      ? scopes
      : String(scopes).split(',').map((x) => x.trim()).filter(Boolean);
    const resources = item.resources ?? defaults.resources ?? [];

    return {
      id: item.id,
      goal: item.goal,
      hypothesis: item.hypothesis,
      experiment: item.experiment ?? plan.experiment ?? defaults.experiment ?? null,
      scopes: normalizedScopes,
      resources: array(resources, `work[${index}].resources`),
      priority: Number(item.priority ?? defaults.priority ?? 0),
      dependsOn: array(item.dependsOn ?? [], `work[${index}].dependsOn`),
      contract: {
        success: item.success ?? item.contract?.success ?? defaults.success ?? defaults.contract?.success ?? null,
        evidence: item.evidencePlan ?? item.contract?.evidence ?? defaults.evidencePlan ?? defaults.contract?.evidence ?? null,
      },
      routing: {
        lane: item.lane ?? item.routing?.lane ?? defaults.lane ?? defaults.routing?.lane ?? 'auto',
        uncertainty: item.uncertainty ?? item.routing?.uncertainty ?? defaults.uncertainty ?? defaults.routing?.uncertainty ?? 'medium',
        oracle: item.oracle ?? item.routing?.oracle ?? defaults.oracle ?? defaults.routing?.oracle ?? 'partial',
        architectureDecision: item.architectureDecision ?? item.routing?.architectureDecision ?? defaults.architectureDecision ?? defaults.routing?.architectureDecision ?? false,
        evidenceConflict: item.evidenceConflict ?? item.routing?.evidenceConflict ?? defaults.evidenceConflict ?? defaults.routing?.evidenceConflict ?? false,
        failedAttempts: item.failedAttempts ?? item.routing?.failedAttempts ?? defaults.failedAttempts ?? defaults.routing?.failedAttempts ?? 0,
      },
    };
  });

  for (const item of work) {
    if (!Number.isFinite(item.priority)) throw new Error(`${item.id} priority must be numeric`);
    if (!item.goal || !item.hypothesis) throw new Error(`${item.id} requires goal and hypothesis`);
  }

  return {
    schemaVersion: 1,
    id: plan.id,
    experiment: plan.experiment ?? null,
    work,
  };
}
