import fs from 'node:fs';
import path from 'node:path';
import { git } from './git.mjs';
import { configureRepository } from './setup.mjs';

const AGENT_START = '<!-- usegit:start -->';
const AGENT_END = '<!-- usegit:end -->';
const WORKFLOW_MARKER = '# usegit:managed';

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

function writeManagedFile(file, content, marker = WORKFLOW_MARKER) {
  ensureDir(file);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, content);
    return 'created';
  }

  const current = fs.readFileSync(file, 'utf8');
  if (!current.includes(marker)) return 'preserved-existing';
  if (current === content) return 'unchanged';

  fs.writeFileSync(file, content);
  return 'updated';
}

function writeIfMissing(file, content) {
  ensureDir(file);
  if (fs.existsSync(file)) return 'preserved-existing';
  fs.writeFileSync(file, content);
  return 'created';
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
    '## Causal Git memory and durable work',
    '',
    'This repository uses usegit as design-time memory and durable execution state. A model invocation owns only the next decision; Git owns the work state.',
    '',
    '1. Before editing, run `' + tool + ' context`. Inspect causal history plus `work.active`, `work.awaiting`, and `work.stale`; do not duplicate existing work.',
    '2. Before implementation, create or claim a `WORK-*` unit with `--scope` (exact paths, `path/**`, or `**`). Inspect `work.conflicts` before editing. Set a unique `USEGIT_AGENT_ID` when multiple agents can run concurrently.',
    '3. Never steal an unexpired lease. Before waiting on CI or another external event, persist the continuation with `' + tool + ' await WORK-* --event ...`. A later fresh invocation resumes with `' + tool + ' resume WORK-* --result ...`.',
    '4. Work under an experiment with one falsifiable hypothesis. Create an experiment record when no existing experiment covers the change.',
    '5. Keep one stable `Usegit-Change-Id` across revisions of the same conceptual change.',
    '6. Every non-merge commit after the bootstrap commit must include `Usegit-Change-Id`, `Usegit-Experiment`, `Usegit-Intent`, `Usegit-Hypothesis`, `Usegit-Granularity`, and `Usegit-Decision` trailers.',
    '7. Treat commit granularity as dynamic: one independently falsifiable causal unit. Implementation, its directly coupled test, and minimum documentation may belong together.',
    '8. Preserve rejected and falsified hypotheses with their conditions. Do not silently retry equivalent failed work.',
    '9. Pull requests are integration boundaries, not work containers. Do not create a PR per task or agent. Use `' + tool + ' integration -- <plan.json>` after evidence is accepted.',
    '10. After an experiment changes state, run `' + tool + ' next` and let accumulated evidence propose the next falsifiable step.',
    '',
    AGENT_END,
  ].join('\n');
}

function workflow(toolRef) {
  return [
    WORKFLOW_MARKER,
    'name: usegit',
    '',
    'on:',
    '  push:',
    '  pull_request:',
    '',
    'jobs:',
    '  causal-history:',
    '    permissions:',
    '      contents: write',
    '    uses: Pom4H/usegit/.github/workflows/reusable.yml@' + toolRef,
    '    with:',
    '      tool_ref: ' + toolRef,
    '',
  ].join('\n');
}

const PLAN_EXAMPLE = JSON.stringify({
  intent: 'example',
  hypothesis: 'implementation and its test form one causal unit',
  changes: [
    { path: 'src/example', causalUnit: 'unit-a', lines: 40 },
    { path: 'test/example', causalUnit: 'unit-a', lines: 25 },
  ],
}, null, 2) + '\n';

const INTEGRATION_EXAMPLE = JSON.stringify({
  work: [
    { id: 'WORK-0001', status: 'accepted' },
    { id: 'WORK-0002', status: 'accepted' },
  ],
  conflicts: [],
  boundaries: {
    humanReview: false,
    protectedTarget: false,
    release: false,
    externalContributor: false,
  },
}, null, 2) + '\n';

const EXPERIMENTS_README = [
  '# Experiments',
  '',
  'Durable experiment records live here. Keep rejected and falsified hypotheses; negative knowledge is part of the repository memory.',
  '',
  'A minimal record contains `id`, `question`, `hypothesis`, `status`, `metrics`, and `decision`.',
  '',
].join('\n');

function mergeConfig(file, toolRef) {
  const defaults = {
    schemaVersion: 1,
    notesRef: 'refs/notes/usegit',
    workRefPrefix: 'refs/usegit/work/',
    granularityPolicy: 'dynamic',
    integrationPolicy: 'boundary-only',
    tool: {
      repository: 'Pom4H/usegit',
      ref: toolRef,
    },
  };

  let config = defaults;
  let status = 'created';

  if (fs.existsSync(file)) {
    const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
    config = {
      ...defaults,
      ...existing,
      tool: {
        ...defaults.tool,
        ...(existing.tool ?? {}),
      },
    };
    if (toolRef) config.tool.ref = toolRef;
    status = 'updated';
  }

  const next = JSON.stringify(config, null, 2) + '\n';
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === next) return { status: 'unchanged', config };

  ensureDir(file);
  fs.writeFileSync(file, next);
  return { status, config };
}

export function initializeRepository(cwd = process.cwd(), options = {}) {
  const root = git(['rev-parse', '--show-toplevel'], { cwd });
  const toolRef = options.toolRef ?? 'main';

  const configResult = mergeConfig(path.join(root, '.usegit', 'config.json'), toolRef);
  const files = {
    config: configResult.status,
    agents: updateAgents(path.join(root, 'AGENTS.md'), agentBlock(configResult.config.tool.ref)),
    workflow: writeManagedFile(
      path.join(root, '.github', 'workflows', 'usegit-causal.yml'),
      workflow(configResult.config.tool.ref),
    ),
    planExample: writeIfMissing(path.join(root, '.usegit', 'plan.example.json'), PLAN_EXAMPLE),
    integrationExample: writeIfMissing(
      path.join(root, '.usegit', 'integration.example.json'),
      INTEGRATION_EXAMPLE,
    ),
    experimentsReadme: writeIfMissing(path.join(root, 'experiments', 'README.md'), EXPERIMENTS_README),
  };

  return {
    root,
    tool: configResult.config.tool,
    files,
    git: configureRepository(root),
    next: 'Commit the bootstrap files once. Causal trailers are required from the following non-merge commit onward.',
  };
}

export { AGENT_START, AGENT_END, WORKFLOW_MARKER };
