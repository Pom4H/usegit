#!/usr/bin/env node
import fs from 'node:fs';
import { buildReport } from './report.mjs';
import { history, validationErrors } from './metadata.mjs';
import { nextExperiment } from './next.mjs';
import { evaluatePlan } from './granularity.mjs';
import { compactCausalHistory } from './context.mjs';
import { decideIntegration } from './integration.mjs';
import { initializeRepository } from './init.mjs';
import { awaitWork, finishWork, resumeWork, startWork, workStatus } from './work.mjs';
import { configureRepository } from './setup.mjs';

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

function workCommand(action, values) {
  const args = parseArgs(values);
  const id = args._[0] ?? args.id;

  if (action === 'start') {
    return startWork({
      id: args.id,
      goal: args.goal,
      hypothesis: args.hypothesis,
      experiment: args.experiment ?? null,
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
  if (action === 'resume') {
    if (!id) throw new Error('resume requires WORK id');
    return resumeWork(id, {
      result: args.result ?? null,
      evidence: args.evidence ?? null,
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
  } else if (['start', 'status', 'await', 'resume', 'finish'].includes(command)) {
    print(workCommand(command, process.argv.slice(3)));
  } else {
    console.error(`Unknown command: ${command}`);
    process.exitCode = 2;
  }
} catch (error) {
  console.error(`usegit: ${error.message}`);
  process.exitCode = 1;
}
