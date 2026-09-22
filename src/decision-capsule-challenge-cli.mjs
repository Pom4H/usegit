import { buildDecisionCapsuleChallenge } from './decision-capsule-challenge.mjs';

process.stdout.write(JSON.stringify(buildDecisionCapsuleChallenge(), null, 2) + '\n');
