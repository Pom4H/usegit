#!/usr/bin/env node
import fs from 'node:fs';
import { doctorRepository } from './doctor.mjs';
import { initializeRepository } from './init.mjs';
import {
  awaitWork, claimNextWork, claimWork, createWorkBatch, escalateWork,
  finishWork, recordWorkEvidence, resumeWork, startWork, workStatus,
} from './work.mjs';

const command = process.argv[2] ?? 'status';
function print(value) { process.stdout.write(JSON.stringify(value, null, 2) + '\n'); }
function parseArgs(values) {
  const args = { _: [] };
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (!value.startsWith('--')) { args._.push(value); continue; }
    const key = value.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = values[i + 1];
    if (next !== undefined && !next.startsWith('--')) { args[key] = next; i += 1; }
    else args[key] = true;
  }
  return args;
}
function csv(value) { return value ? String(value).split(',').map((x) => x.trim()).filter(Boolean) : []; }
function resources(args) { return [
  ...csv(args.resourceRead).map((name) => ({ name, access: 'read' })),
  ...csv(args.resourceWrite).map((name) => ({ name, access: 'write' })),
]; }
function routing(args) { return {
  lane: args.lane ?? 'auto', uncertainty: args.uncertainty ?? 'medium', oracle: args.oracle ?? 'partial',
  architectureDecision: args.architectureDecision ?? false, evidenceConflict: args.evidenceConflict ?? false,
  failedAttempts: args.failedAttempts ?? 0,
}; }
function contract(args) { return { success: args.success ?? null, evidence: args.evidencePlan ?? null }; }
function runInfo(args, prefix = '') {
  const key = (name) => prefix ? prefix + name[0].toUpperCase() + name.slice(1) : name;
  const provider = args[key('runProvider')] ?? null, id = args[key('runId')] ?? null, attempt = args[key('runAttempt')] ?? null;
  return provider === null && id === null && attempt === null ? null : { provider, id, attempt };
}
function workCommand(action, values) {
  const args = parseArgs(values); const id = args._[0] ?? args.id;
  if (action === 'start') return startWork({
    id: args.id, goal: args.goal, hypothesis: args.hypothesis, scopes: csv(args.scope), resources: resources(args),
    contract: contract(args), routing: routing(args), batchId: args.batch ?? null, priority: args.priority ?? 0,
    dependsOn: csv(args.dependsOn), owner: args.owner, leaseMinutes: args.leaseMinutes ?? 30, remote: args.remote ?? 'origin',
  });
  if (action === 'status') return workStatus({ sync: !args.local, remote: args.remote ?? 'origin' });
  if (action === 'await') { if (!id) throw new Error('await requires WORK id'); return awaitWork(id, { event: args.event, owner: args.owner, onSuccess: args.onSuccess ?? null, onFailure: args.onFailure ?? null, remote: args.remote ?? 'origin' }); }
  if (action === 'escalate') { if (!id) throw new Error('escalate requires WORK id'); return escalateWork(id, { reason: args.reason, owner: args.owner, remote: args.remote ?? 'origin' }); }
  if (action === 'claim') { if (!id) throw new Error('claim requires WORK id'); return claimWork(id, { owner: args.owner, leaseMinutes: args.leaseMinutes ?? 30, remote: args.remote ?? 'origin' }); }
  if (action === 'claim-next') return claimNextWork({ owner: args.owner, leaseMinutes: args.leaseMinutes ?? 30, remote: args.remote ?? 'origin', retries: Number(args.retries ?? 8) });
  if (action === 'evidence') { if (!id) throw new Error('evidence requires WORK id'); return recordWorkEvidence(id, { kind: args.kind ?? 'asserted', result: args.result ?? null, observation: args.observation ?? args.evidence ?? null, source: args.source ?? null, environment: args.environment ?? null, event: args.event ?? null, quality: args.quality ?? null, run: runInfo(args), owner: args.owner, remote: args.remote ?? 'origin' }); }
  if (action === 'resume') { if (!id) throw new Error('resume requires WORK id'); return resumeWork(id, { result: args.result ?? null, evidence: args.evidence ?? null, evidenceKind: args.evidenceKind ?? 'asserted', evidenceSource: args.evidenceSource ?? null, evidenceEnvironment: args.evidenceEnvironment ?? null, evidenceQuality: args.evidenceQuality ?? null, evidenceRun: runInfo(args, 'evidence'), owner: args.owner, leaseMinutes: args.leaseMinutes ?? 30, remote: args.remote ?? 'origin' }); }
  if (action === 'finish') { if (!id) throw new Error('finish requires WORK id'); return finishWork(id, { decision: args.decision ?? 'accepted', summary: args.summary ?? null, owner: args.owner, remote: args.remote ?? 'origin' }); }
  throw new Error('unknown work command: ' + action);
}
try {
  if (command === 'init') { const args = parseArgs(process.argv.slice(3)); print(initializeRepository(process.cwd(), { toolRef: args.toolRef })); }
  else if (command === 'doctor') { const args = parseArgs(process.argv.slice(3)); const result = doctorRepository({ repair: Boolean(args.repair), remote: args.remote ?? 'origin' }); print(result); if (!result.healthy) process.exitCode = 1; }
  else if (command === 'batch') { const args = parseArgs(process.argv.slice(3)); const file = args._[0] ?? '.usegit/batch.json'; print(createWorkBatch(JSON.parse(fs.readFileSync(file, 'utf8')), { owner: args.owner, remote: args.remote ?? 'origin' })); }
  else if (command === 'work') print(workCommand(process.argv[3] ?? 'status', process.argv.slice(4)));
  else if (['start','status','await','escalate','claim','claim-next','evidence','resume','finish'].includes(command)) print(workCommand(command, process.argv.slice(3)));
  else { console.error('Unknown command: ' + command); process.exitCode = 2; }
} catch (error) { console.error('usegit: ' + error.message); process.exitCode = 1; }
