import fs from 'node:fs';
import path from 'node:path';
import { git } from './git.mjs';

const AGENT_START = '<!-- usegit:start -->';
const AGENT_END = '<!-- usegit:end -->';
function ensureDir(file) { fs.mkdirSync(path.dirname(file), { recursive: true }); }
function writeIfMissing(file, content) { ensureDir(file); if (fs.existsSync(file)) return 'preserved-existing'; fs.writeFileSync(file, content); return 'created'; }
function updateAgents(file, block) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const expression = new RegExp(AGENT_START + '[\\s\\S]*?' + AGENT_END, 'm');
  const next = expression.test(current) ? current.replace(expression, block) : current.trim() ? current.replace(/\s*$/, '') + '\n\n' + block + '\n' : '# Agent instructions\n\n' + block + '\n';
  if (next === current) return 'unchanged'; ensureDir(file); fs.writeFileSync(file, next); return current ? 'updated' : 'created';
}
function agentBlock(toolRef) {
  const tool = 'npx --yes github:Pom4H/usegit#' + toolRef;
  return [AGENT_START, '## usegit', '',
    '1. Run `' + tool + ' status` before taking work.',
    '2. Use `' + tool + ' claim-next` for ready WORK; never steal an unexpired lease.',
    '3. Before waiting on CI or another event, persist the handoff with `' + tool + ' await WORK-* --event ...`.',
    '4. Resume later with `' + tool + ' resume WORK-* --result ...`.',
    '5. Accepted WORK requires observed/attested evidence for the exact current Git tree.',
    '6. Run `' + tool + ' doctor` when state is ambiguous.',
    '', AGENT_END].join('\n');
}
const BATCH_EXAMPLE = JSON.stringify({ id: 'BATCH-example', defaults: { uncertainty: 'low', oracle: 'objective', evidencePlan: 'CI' }, work: [{ id: 'WORK-example', goal: 'implement component', hypothesis: 'implementation satisfies its tests', scopes: ['src/**'], success: 'tests pass' }] }, null, 2) + '\n';
function mergeConfig(file, toolRef) {
  const defaults = { schemaVersion: 1, workRefPrefix: 'refs/usegit/work/', tool: { repository: 'Pom4H/usegit', ref: toolRef } };
  let config = defaults, status = 'created';
  if (fs.existsSync(file)) { const existing = JSON.parse(fs.readFileSync(file, 'utf8')); config = { ...defaults, ...existing, tool: { ...defaults.tool, ...(existing.tool ?? {}) } }; if (toolRef) config.tool.ref = toolRef; status = 'updated'; }
  delete config.notesRef; delete config.granularityPolicy; delete config.integrationPolicy;
  const next = JSON.stringify(config, null, 2) + '\n'; if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === next) return { status: 'unchanged', config }; ensureDir(file); fs.writeFileSync(file, next); return { status, config };
}
export function initializeRepository(cwd = process.cwd(), options = {}) {
  const root = git(['rev-parse', '--show-toplevel'], { cwd }); const toolRef = options.toolRef ?? 'main'; const configResult = mergeConfig(path.join(root, '.usegit', 'config.json'), toolRef);
  const files = { config: configResult.status, agents: updateAgents(path.join(root, 'AGENTS.md'), agentBlock(configResult.config.tool.ref)), batchExample: writeIfMissing(path.join(root, '.usegit', 'batch.example.json'), BATCH_EXAMPLE) };
  return { root, tool: configResult.config.tool, files, next: 'Run usegit status.' };
}
export { AGENT_START, AGENT_END };
