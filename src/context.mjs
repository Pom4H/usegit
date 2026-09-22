const FIELDS = ['changeId', 'experiment', 'intent', 'hypothesis', 'granularity', 'decision'];

export function compactCausalHistory(commits, limit = 12) {
  return commits
    .filter((commit) => commit.metadata?.changeId)
    .slice(0, limit)
    .map((commit) => {
      const compact = {
        sha: commit.sha.slice(0, 12),
        subject: commit.subject,
      };
      for (const field of FIELDS) {
        if (commit.metadata[field] !== undefined) compact[field] = commit.metadata[field];
      }
      return compact;
    });
}

export function criticalFieldRecall(commits, packet, limit = 12) {
  const source = commits.filter((commit) => commit.metadata?.changeId).slice(0, limit);
  let expected = 0;
  let preserved = 0;

  for (let index = 0; index < source.length; index += 1) {
    for (const field of FIELDS) {
      const value = source[index].metadata[field];
      if (value === undefined) continue;
      expected += 1;
      if (packet[index]?.[field] === value) preserved += 1;
    }
  }

  return expected ? preserved / expected : 1;
}

export { FIELDS as CRITICAL_CAUSAL_FIELDS };
