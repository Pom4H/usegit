#!/usr/bin/env node
import fs from 'node:fs';
import { buildReport } from './report.mjs';
import { history, validationErrors } from './metadata.mjs';
import { nextExperiment } from './next.mjs';
import { evaluatePlan } from './granularity.mjs';

const command = process.argv[2] ?? 'context';

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (command === 'context') {
  const commits = history(30).filter((x) => x.metadata.changeId).slice(0, 12);
  print({
    head: commits[0]?.sha ?? null,
    causalHistory: commits.map((x) => ({ sha: x.sha.slice(0, 12), subject: x.subject, ...x.metadata })),
    next: nextExperiment(buildReport()),
  });
} else if (command === 'report') {
  print(buildReport());
} else if (command === 'next') {
  print(nextExperiment(buildReport()));
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
} else {
  console.error(`Unknown command: ${command}`);
  process.exitCode = 2;
}
