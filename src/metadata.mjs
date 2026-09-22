import { git } from './git.mjs';

const REQUIRED = ['changeId', 'experiment', 'intent', 'hypothesis', 'granularity', 'decision'];

function camel(key) {
  return key
    .replace(/^Usegit-/, '')
    .toLowerCase()
    .replace(/-([a-z])/g, (_, x) => x.toUpperCase());
}

export function parseTrailers(message) {
  const result = {};
  for (const line of message.split('\n')) {
    const match = line.match(/^(Usegit-[A-Za-z0-9-]+):\s*(.+?)\s*$/);
    if (!match) continue;
    const key = camel(match[1]);
    const value = match[2];
    if (key in result) {
      result[key] = Array.isArray(result[key]) ? [...result[key], value] : [result[key], value];
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function history(limit = 200) {
  const raw = git(['log', `-${limit}`, '--format=%H%x1f%P%x1f%B%x1e']);
  return raw
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, parents = '', ...messageParts] = record.split('\x1f');
      const message = messageParts.join('\x1f').trim();
      return {
        sha,
        parents: parents.trim() ? parents.trim().split(/\s+/) : [],
        message,
        subject: message.split('\n')[0] ?? '',
        metadata: parseTrailers(message),
      };
    });
}

export function validationErrors(commits = history()) {
  const chronological = [...commits].reverse();
  const firstStructured = chronological.findIndex((c) => c.metadata.changeId);
  if (firstStructured < 0) return ['No structured usegit commit exists yet.'];

  const errors = [];
  for (const commit of chronological.slice(firstStructured)) {
    if (commit.parents.length > 1) continue;
    for (const field of REQUIRED) {
      if (!commit.metadata[field]) errors.push(`${commit.sha.slice(0, 8)} missing Usegit-${field}`);
    }
    if (commit.metadata.granularity && !['coarse', 'fine', 'dynamic'].includes(commit.metadata.granularity)) {
      errors.push(`${commit.sha.slice(0, 8)} invalid granularity ${commit.metadata.granularity}`);
    }
  }
  return errors;
}

export { REQUIRED };
