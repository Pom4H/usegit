export function findRepeatedFalsifiedHypotheses(commits) {
  const falsified = new Map();
  const repeated = [];

  for (const commit of [...commits].reverse()) {
    const { hypothesis, decision, conditionsChanged } = commit.metadata ?? {};
    if (!hypothesis) continue;

    const previous = falsified.get(hypothesis);
    if (previous && decision !== 'falsified' && conditionsChanged !== 'true') {
      repeated.push({
        hypothesis,
        falsifiedAt: previous,
        repeatedAt: commit.sha,
      });
    }

    if (decision === 'falsified') {
      falsified.set(hypothesis, commit.sha);
    } else if (conditionsChanged === 'true') {
      falsified.delete(hypothesis);
    }
  }

  return repeated;
}
