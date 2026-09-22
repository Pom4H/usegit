import fs from 'node:fs';
import path from 'node:path';
import { git } from './git.mjs';

const AGENT_START = '<!-- usegit:start -->';
const AGENT_END = '<!-- usegit:end -->';

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function updateAgents(file, block) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const expression = new RegExp(AGENT_START + '[\\s\\S]*?' + AGENT_END, 'm');
  let next;

  if (expression.test(current)) {
    next = current.replace(expression, block);
  } else if (current.trim()) {
    next = current.replace(/\s*$/, '') + '\n\n' + block + '\n';
  } else {
    next = '# Agent instructions\n\n' + block + '\n';
  }

  if (next === current) return 'unchanged';
  ensureDir(file);
  fs.writeFileSync(file, next);
  return current ? 'updated' : 'created';
}

function agentBlock(toolRef) {
  const tool = 'npx --yes github:Pom4H/usegit#' + toolRef;
  return [
    AGENT_START,
    '## Agent coordination',
    '',
    'usegit coordinates coding agents through Git refs. It does not prescribe commit messages, branches, PRs, or commit granularity.',
    '',
    '1. Run `' + tool + ' status` before taking shared work.',
    '2. Workers take only `workerReady` items; prefer `' + tool + ' claim-next`.',
    '3. Never steal an unexpired lease. Stale work may be explicitly resumed by a new owner.',
    '4. Before waiting on CI or another external event, persist the handoff with `' + tool + ' await WORK-* --event ...`.',
    '5. A fresh agent resumes with `' + tool + ' status` and `' + tool + ' resume WORK-* --result ...`.',
    '6. Accepted work requires observed/attested successful evidence for the exact current Git tree.',
    '7. Use file scopes and semantic resources to prevent conflicting parallel work.',
    '8. Run `' + tool + ' doctor` when ownership or evidence state looks inconsistent.',
    '',
    AGENT_END,
  ].join('\n');
}

export function initializeRepository(cwd = process.cwd(), options = {}) {
  const root = git(['rev-parse', '--show-toplevel'], { cwd });
  const toolRef = options.toolRef ?? 'main';
  const agents = updateAgents(path.join(root, 'AGENTS.md'), agentBlock(toolRef));

  return {
    root,
    tool: { repository: 'Pom4H/usegit', ref: toolRef },
    files: { agents },
    next: 'Commit AGENTS.md if you want the coordination rules shared with other agents.',
  };
}

export { AGENT_START, AGENT_END };
