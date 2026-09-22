import { execFileSync } from 'node:child_process';

export function git(args, options = {}) {
  const hasInput = options.input !== undefined;
  return execFileSync('git', args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    stdio: [hasInput ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    input: options.input,
    env: { ...process.env, ...options.env },
  }).trimEnd();
}

export function tryGit(args, options = {}) {
  try {
    return git(args, options);
  } catch {
    return '';
  }
}

export function commitStats(sha) {
  const output = tryGit(['show', '--numstat', '--format=', sha]);
  let additions = 0;
  let deletions = 0;
  let files = 0;
  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const [a, d] = line.split('\t');
    files += 1;
    if (/^\d+$/.test(a)) additions += Number(a);
    if (/^\d+$/.test(d)) deletions += Number(d);
  }
  return { files, additions, deletions, lines: additions + deletions };
}
