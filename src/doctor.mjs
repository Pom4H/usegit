import {
  evidenceIntegrity,
  evidenceIsAdmissible,
  evidenceIsPositive,
  supportingEvidenceForTree,
} from './evidence.mjs';
import { git, tryGit } from './git.mjs';
import { compactWorkOverview, effectiveWorkStatus } from './work-state.mjs';

const PREFIX = 'refs/usegit/work/';
const TERMINAL = new Set(['accepted', 'rejected', 'falsified']);

function commandSucceeds(args, cwd) {
  try {
    git(args, { cwd });
    return true;
  } catch {
    return false;
  }
}

function hasRemote(cwd, remote) {
  return Boolean(tryGit(['remote', 'get-url', remote], { cwd }));
}

function scanRefs(cwd) {
  const output = tryGit(['for-each-ref', '--format=%(refname) %(objectname)', PREFIX], { cwd });
  if (!output.trim()) return [];

  return output.split('\n').filter(Boolean).map((line) => {
    const space = line.lastIndexOf(' ');
    return { ref: line.slice(0, space), commit: line.slice(space + 1) };
  });
}

function readStates(cwd, errors) {
  const states = [];
  for (const entry of scanRefs(cwd)) {
    try {
      const raw = git(['show', `${entry.ref}:work.json`], { cwd });
      const state = JSON.parse(raw);
      states.push({ ...state, stateCommit: entry.commit, ref: entry.ref });
    } catch (error) {
      errors.push({
        code: 'malformed-work-ref',
        ref: entry.ref,
        message: error.message,
      });
    }
  }
  return states;
}

function objectType(cwd, sha) {
  return tryGit(['cat-file', '-t', sha], { cwd }) || null;
}

function issue(list, code, work, message, extra = {}) {
  list.push({ code, work: work?.id ?? null, message, ...extra });
}

export function doctorRepository({
  cwd = process.cwd(),
  remote = 'origin',
  repair = false,
  now = Date.now(),
} = {}) {
  const errors = [];
  const warnings = [];
  const repairsPerformed = [];
  const suggestions = [];

  if (repair && hasRemote(cwd, remote)) {
    tryGit(['fetch', remote, `+${PREFIX}*:${PREFIX}*`], { cwd });
    repairsPerformed.push('synchronized-work-refs');
    tryGit(['fetch', remote, 'refs/notes/usegit:refs/notes/usegit'], { cwd });
    repairsPerformed.push('synchronized-evidence-notes');
  }

  const states = readStates(cwd, errors);
  const byId = new Map(states.map((state) => [state.id, state]));
  const head = tryGit(['rev-parse', 'HEAD'], { cwd }) || null;
  const headTree = head ? tryGit(['rev-parse', 'HEAD^{tree}'], { cwd }) || null : null;

  for (const work of states) {
    const effective = effectiveWorkStatus(work, now);
    const lease = work.lease ?? null;

    if (work.status === 'ready' && lease) {
      issue(errors, 'ready-has-lease', work, 'ready WORK must not hold a lease');
    }
    if (work.status === 'active' && !lease) {
      issue(errors, 'active-missing-lease', work, 'active WORK requires a lease');
    }
    if (['awaiting', 'escalated', ...TERMINAL].includes(work.status) && lease) {
      issue(errors, 'nonactive-has-lease', work, `${work.status} WORK must not hold a lease`);
    }
    if (effective === 'stale') {
      issue(warnings, 'stale-lease', work, 'lease expired; WORK can be explicitly reclaimed', {
        owner: lease?.owner ?? null,
        expiresAt: lease?.expiresAt ?? null,
      });
      suggestions.push(`usegit resume ${work.id} --owner <new-owner>`);
    }

    if (!work.base || objectType(cwd, work.base) !== 'commit') {
      issue(errors, 'missing-base-commit', work, 'base commit is missing from the repository', {
        base: work.base ?? null,
      });
    } else {
      const resolvedTree = tryGit(['rev-parse', `${work.base}^{tree}`], { cwd }) || null;
      if (work.baseTree && resolvedTree && work.baseTree !== resolvedTree) {
        issue(errors, 'base-tree-mismatch', work, 'stored baseTree does not match base commit', {
          stored: work.baseTree,
          actual: resolvedTree,
        });
      }

      if (!TERMINAL.has(work.status) && head && work.base !== head) {
        if (!commandSucceeds(['merge-base', '--is-ancestor', work.base, head], cwd)) {
          issue(errors, 'base-diverged', work, 'WORK base is not an ancestor of current HEAD; rebase/revalidation is required', {
            base: work.base,
            head,
          });
        } else {
          const behind = Number(tryGit(['rev-list', '--count', `${work.base}..${head}`], { cwd }) || 0);
          if (behind > 0) {
            issue(warnings, 'base-drift', work, `current HEAD is ${behind} commit(s) ahead of WORK base`, {
              commitsBehind: behind,
              base: work.base,
              head,
            });
          }
        }
      }
    }

    for (const dependency of work.dependsOn ?? []) {
      if (!byId.has(dependency)) {
        issue(errors, 'missing-dependency', work, `dependency ${dependency} does not exist`, {
          dependency,
        });
      }
    }

    if (work.route?.lane === 'worker' && work.route?.ready && !(work.resources ?? []).length) {
      issue(warnings, 'semantic-resources-undeclared', work,
        'worker-ready WORK has only file scopes; semantic conflicts may be invisible');
    }

    for (const [index, evidence] of (work.evidence ?? []).entries()) {
      const integrity = evidenceIntegrity(evidence);
      if (!integrity.valid) {
        issue(errors, 'evidence-integrity-failed', work,
          'evidence digest does not match its stored payload', {
            evidenceIndex: index,
            evidenceId: evidence.id ?? null,
            expectedDigest: integrity.expected,
            actualDigest: integrity.actual,
          });
      } else if (!evidence.digest) {
        issue(warnings, 'legacy-evidence-no-digest', work,
          'legacy evidence has no integrity digest', { evidenceIndex: index });
      }

      if (['observed', 'attested'].includes(evidence.kind)) {
        const tree = evidence.subject?.tree ?? null;
        if (!tree || objectType(cwd, tree) !== 'tree') {
          issue(errors, 'evidence-tree-missing', work, 'trusted evidence references a missing/non-tree object', {
            evidenceIndex: index,
            tree,
          });
        }
        const commit = evidence.subject?.commit ?? null;
        if (commit && objectType(cwd, commit) !== 'commit') {
          issue(errors, 'evidence-commit-missing', work, 'trusted evidence references a missing/non-commit object', {
            evidenceIndex: index,
            commit,
          });
        }
        if (!evidence.environmentHash) {
          issue(errors, 'evidence-environment-missing', work,
            'trusted evidence must carry an environment fingerprint', { evidenceIndex: index });
        }
        if (evidenceIsPositive(evidence) && !evidenceIsAdmissible(evidence)) {
          issue(warnings, 'evidence-not-acceptance-grade', work,
            'positive trusted evidence is contextual but not admissible for acceptance', {
              evidenceIndex: index,
              quality: evidence.quality ?? null,
            });
        }
      }
    }

    if (TERMINAL.has(work.status)) {
      if (work.decision?.outcome !== work.status) {
        issue(errors, 'terminal-decision-mismatch', work,
          'terminal WORK status must match decision outcome');
      }
    }

    if (work.status === 'accepted') {
      const decisionTree = work.decision?.subject?.tree ?? null;
      if (!decisionTree) {
        issue(errors, 'accepted-missing-decision-tree', work,
          'accepted WORK must record the exact decision tree');
      } else if (!supportingEvidenceForTree(work.evidence ?? [], decisionTree).length) {
        issue(errors, 'accepted-without-matching-evidence', work,
          'accepted WORK lacks successful observed/attested evidence for its decision tree', {
            decisionTree,
          });
      }
    }
  }

  const overview = compactWorkOverview(states, now);
  for (const conflict of overview.conflicts) {
    issue(errors, 'live-work-conflict', null, 'live WORK reservations conflict', { conflict });
  }

  if (!states.length) {
    warnings.push({
      code: 'no-work-state',
      work: null,
      message: 'no refs/usegit/work/* state exists yet',
    });
  }

  return {
    schemaVersion: 1,
    healthy: errors.length === 0,
    head,
    headTree,
    workCount: states.length,
    errors,
    warnings,
    repairsPerformed,
    suggestions: [...new Set(suggestions)],
  };
}
