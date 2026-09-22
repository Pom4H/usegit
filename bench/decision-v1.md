# Fresh-agent decision benchmark v1

This benchmark measures the next protocol decision, not coding quality.

A fresh agent receives exactly one generated fixture. It does not receive the repository, scenario name, variant name, evaluator mapping, or oracle. The response is one JSON object:

```json
{
  "action": "claim",
  "workId": "WORK-...",
  "field": null,
  "reasonCode": "ready-work"
}
```

Generate the 30 blind fixtures plus a separate evaluator file:

```bash
npm run decision:prepare -- /tmp/decision-v1
```

For each fixture, start a fresh model context with identical model/tool settings and give it only the fixture JSON. Repeat every cell three times. Store the raw response and runtime/model identity.

Grade one response:

```bash
npm run decision:grade -- <scenario-id> <variant> response.json
```

The evaluator mapping must never be present in the fresh-agent context.

The complete matrix is 10 scenarios × 3 startup representations × 3 repetitions = 90 independent runs.
