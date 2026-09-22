import fs from 'node:fs';
import {
  buildDecisionFixture,
  decisionBenchmarkMatrix,
  gradeDecisionRun,
  prepareDecisionFixtures,
  verifyDecisionBenchmark,
} from './fresh-agent-benchmark.mjs';

const command = process.argv[2] ?? 'verify';

function print(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

if (command === 'verify') {
  print(verifyDecisionBenchmark());
} else if (command === 'matrix') {
  print(decisionBenchmarkMatrix());
} else if (command === 'fixture') {
  const scenarioId = process.argv[3];
  const variant = process.argv[4];
  if (!scenarioId || !variant) throw new Error('fixture requires scenario id and variant');
  print(buildDecisionFixture(scenarioId, variant));
} else if (command === 'grade') {
  const scenarioId = process.argv[3];
  const variant = process.argv[4];
  const file = process.argv[5] ?? '-';
  if (!scenarioId || !variant) throw new Error('grade requires scenario id and variant');
  const response = file === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(file, 'utf8');
  print(gradeDecisionRun({ scenarioId, variant, response }));
} else if (command === 'prepare') {
  const directory = process.argv[3] ?? '.usegit/decision-v1';
  print(prepareDecisionFixtures(directory));
} else {
  throw new Error('unknown fresh-agent benchmark command: ' + command);
}
