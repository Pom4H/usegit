import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  agentContextCriticalFieldRecall,
  compileAgentContext,
  defaultAgentContextPath,
  renderAgentContext,
} from './agent-context.mjs';
import { git, tryGit } from './git.mjs';

const compiled = compileAgentContext({ sync: true });
const rawContext = execFileSync(
  process.execPath,
  ['src/cli.mjs', 'context'],
  { encoding: 'utf8' },
);

const root = git(['rev-parse', '--show-toplevel']);
const cachePath = defaultAgentContextPath();
const relativeCachePath = path.relative(root, cachePath);
const trackedRuntimeProjection = Boolean(tryGit(['ls-files', '--', relativeCachePath]));
const recall = agentContextCriticalFieldRecall(compiled.model, compiled.markdown);
const deterministicRegeneration =
  renderAgentContext(compiled.model) === renderAgentContext(structuredClone(compiled.model));

const rawContextBytes = Buffer.byteLength(rawContext);
const metrics = {
  schemaVersion: 1,
  head: compiled.model.head,
  decisionCriticalFieldRecall: Number(recall.toFixed(4)),
  compiledContextBytes: compiled.bytes,
  rawContextBytes,
  compiledToRawRatio: rawContextBytes
    ? Number((compiled.bytes / rawContextBytes).toFixed(4))
    : 0,
  deterministicRegeneration,
  runtimeCachePath: relativeCachePath,
  trackedRuntimeProjection,
};

process.stdout.write(JSON.stringify(metrics, null, 2) + '\n');
