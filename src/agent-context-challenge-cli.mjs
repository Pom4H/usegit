import { buildAgentContextChallenge } from './agent-context-challenge.mjs';

process.stdout.write(JSON.stringify(buildAgentContextChallenge(), null, 2) + '\n');
