#!/usr/bin/env node
import fs from 'node:fs';
import { buildReport } from './report.mjs';
import { doctorRepository } from './doctor.mjs';
import { history, validationErrors } from './metadata.mjs';
import { nextExperiment } from './next.mjs';
import { evaluatePlan } from './granularity.mjs';
import { compactCausalHistory } from './context.mjs';
import { checkAgentContext, compileAgentContext, writeAgentContext } from './agent-context.mjs';
import { decideIntegration } from './integration.mjs';
import { initializeRepository } from './init.mjs';
import { recommendRoute } from './routing.mjs';
import {
  awaitWork,
  claimNextWork,
  claimWork,
  createWorkBatch,
  escalateWork,
  finishWork,
  recordWorkEvidence,
  resumeWork,
  startWork,
  workStatus,
} from './work.mjs';
import { configureRepository } from './setup.mjs';
import { buildViewModel, renderView, writeView } from './view.mjs';

const command = process.argv[2] ?? 'context';

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(values) {
  const args = { _: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) {
      args._.push(value);
      continue;
    }

    const raw = value.slice(2);
    const key = raw.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = values[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function csv(value) {
  if (!value) return [];
  return String(value).split(',').map((x) => x.trim()).filter(Boolean);
}

function resourcesFromArgs(args) {
  return [
    ...csv(args.resourceRead).map((name) => ({ name, access: 'read' })),
    ...csv(args.resourceWrite).map((name) => ({ name, access: 'write' })),
  ];
}

function routingFromArgs(args) {
  return {
    lane: args.lane ?? 'auto',
    uncertainty: args.uncertainty ?? 'medium',
    oracle: args.oracle ?? 'partial',
    architectureDecision: args.architectureDecision ?? false,
    evidenceConflict: args.evidenceConflict ?? false,
    failedAttempts: args.failedAttempts ?? 0,
  };
}

function contractFromArgs(args) {
  return {
    success: args.success ?? null,
    evidence: args.evidencePlan ?? null,
  };
}

function evidenceRunFromArgs(args, prefix = '') {
  const key = (name) => prefix
    ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}`
    : name;
  const provider = args[key('runProvider')] ?? null;
  const id = args[key('runId')] ?? null;
  const attempt = args[key('runAttempt')] ?? null;
  if (provider === null && id === null && attempt === null) return null;
  return { provider, id, attempt };
}

function workCommand(action, values) {
  const args = parseArgs(values);
  const id = args._[0] ?? args.id;

  if (action === 'start') {
    return startWork({
      id: args.id,
      goal: args.goal,
      hypothesis: args.hypothesis,
      experiment: args.experiment ?? null,
      scopes: csv(args.scope),
      resources: resourcesFromArgs(args),
      contract: contractFromArgs(args),
      routing: routingFromArgs(args),
      batchId: args.batch ?? null,
      priority: args.priority ?? 0,
      dependsOn: csv(args.dependsOn),
      owner: args.owner,
      leaseMinutes: args.leaseMinutes ?? 30,
      remote: args.remote ?? 'origin',
    });
  }
  if (action === 'status') {
    return workStatus({ sync: true, remote: args.remote ?? 'origin' });
  }
  if (action === 'await') {
    if (!id) throw new Error('await requires WORK id');
    return awaitWork(id, {
      event: args.event,
      owner: args.owner,
      onSuccess: args.onSuccess ?? null,
      onFailure: args.onFailure ?? null,
      remote: args.remote ?? 'origin',
    });
  }
  if (action === 'escalate') {
    if (!id) throw new Error('escalate requires WORK id');
    return escalateWork(id, {
      reason: args.reason,
      owner: args.owner,
      remote: args.remote ?? 'origin',
    });
  }
  if (action === 'claim') {
    if (!id) throw new Error('claim requires WORK id');
    return claimWork(id, {
      owner: args.owner,
      leaseMinutes: args.leaseMinutes ?? 30,
      remote: args.remote ?? 'origin',
    });
  }
  if (action === 'claim-next') {
    return claimNextWork({
      owner: args.owner,
      leaseMinutes: args.leaseMinutes ?? 30,
      remote: args.remote ?? 'origin',
      retries: Number(args.retries ?? 8),
    });
  }
  if (action === 'evidence') {
    if (!id) throw new Error('evidence requires WORK id');
    return recordWorkEvidence(id, {
      kind: args.kind ?? 'asserted',
      result: args.result ?? null,
      observation: args.observation ?? args.evidence ?? null,
      source: args.source ?? null,
      environment: args.environment ?? null,
      event: args.event ?? null,
      quality: args.quality ?? null,
      run: evidenceRunFromArgs(args),
      owner: args.owner,
      remote: args.remote ?? 'origin',
    });
  }
  if (action === 'resume') {
    if (!id) throw new Error('resume requires WORK id');
    return resumeWork(id, {
      result: args.result ?? null,
      evidence: args.evidence ?? null,
      evidenceKind: args.evidenceKind ?? 'asserted',
      evidenceSource: args.evidenceSource ?? null,
      evidenceEnvironment: args.evidenceEnvironment ?? null,
      evidenceQuality: args.evidenceQuality ?? null,
      evidenceRun: evidenceRunFromArgs(args, 'evidence'),
      owner: args.owner,
      leaseMinutes: args.leaseMinutes ?? 30,
      remote: args.remote ?? 'origin',
    });
  }
  if (action === 'finish') {
    if (!id) throw new Error('finish requires WORK id');
    return finishWork(id, {
      decision: args.decision ?? 'accepted',
      summary: args.summary ?? null,
      owner: args.owner,
      remote: args.remote ?? 'origin',
    });
  }

  throw new Error(`unknown work command: ${action}`);
}

try {
  if (command === 'init') {
    const args = parseArgs(process.argv.slice(3));
    print(initializeRepository(process.cwd(), { toolRef: args.toolRef }));
  } else if (command === 'context') {
    const commits = history(30);
    print({
      head: commits[0]?.sha ?? null,
      work: workStatus({ sync: true }),
      causalHistory: compactCausalHistory(commits),
      next: nextExperiment(buildReport()),
    });
  } else if (command === 'agents') {
    const args = parseArgs(process.argv.slice(3));
    const options = {
      sync: Boolean(args.sync),
      remote: args.remote ?? 'origin',
      ...(args.output ? { output: args.output } : {}),
    };
    if (args.check) {
      const result = checkAgentContext(options);
      print(result);
      if (!result.fresh) process.exitCode = 1;
    } else if (args.write) {
      print(writeAgentContext(options));
    } else {
      process.stdout.write(compileAgentContext(options).markdown);
    }
  } else if (command === 'view') {
    const args = parseArgs(process.argv.slice(3));
    const options = { sync: Boolean(args.sync) };
    if (args.model) {
      print(buildViewModel(options));
    } else if (args.output) {
      print(writeView(args.output, options));
    } else {
      process.stdout.write(renderView(buildViewModel(options)));
    }
  } else if (command === 'doctor') {
    const args = parseArgs(process.argv.slice(3));
    const diagnosis = doctorRepository({
      repair: Boolean(args.repair),
      remote: args.remote ?? 'origin',
    });
    print(diagnosis);
    if (!diagnosis.healthy) process.exitCode = 1;
  } else if (command === 'batch') {
    const args = parseArgs(process.argv.slice(3));
    const file = args._[0] ?? '.usegit/batch.json';
    const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
    print(createWorkBatch(plan, {
      owner: args.owner,
      remote: args.remote ?? 'origin',
      leaseMinutes: args.leaseMinutes ?? 30,
    }));
  } else if (command === 'route') {
    const args = parseArgs(process.argv.slice(3));
    print(recommendRoute(routingFromArgs(args), contractFromArgs(args)));
  } else if (command === 'report') {
    print(buildReport());
  } else if (command === 'next') {
    print(nextExperiment(buildReport()));
  } else if (command === 'setup') {
    print(configureRepository());
  } else if (command === 'validate') {
    const errors = validationErrors();
    if (errors.length) {
      for (const error of errors) console.error(`usegit: ${error}`);
      process.exitCode = 1;
    } else {
      console.log('usegit: causal metadata valid');
    }
  } else if (command === 'boundary') {
    const file = process.argv[3] ?? '.usegit/plan.json';
    const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
    print(evaluatePlan(plan));
  } else if (command === 'integration') {
    const file = process.argv[3] ?? '.usegit/integration.json';
    const plan = JSON.parse(fs.readFileSync(file, 'utf8'));
    print(decideIntegration(plan));
  } else if (command === 'work') {
    print(workCommand(process.argv[3] ?? 'status', process.argv.slice(4)));
  } else if (['start', 'status', 'await', 'escalate', 'claim', 'claim-next', 'evidence', 'resume', 'finish'].includes(command)) {
    print(workCommand(command, process.argv.slice(3)));
  } else {
    console.error(`Unknown command: ${command}`);
    process.exitCode = 2;
  }
} catch (error) {
  console.error(`usegit: ${error.message}`);
  process.exitCode = 1;
}
