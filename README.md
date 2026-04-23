# Agentic SOC Memory Store

`agentic-soc-memory-store` is a production-oriented component for the pattern described in the Claude Code memory leak discussion: store many important memories in a single lightweight file, scan short prefixes first, and lazy-load full memory records only for the current task.

This implementation is tailored for agentic SOC systems:

- one memory per markdown line
- title-first layout for cheap preview scans
- byte-offset index for lazy full-line fetches
- SOC metadata for alerts, detections, incidents, risks, playbooks, and hypotheses
- append, update, archive, and relevance retrieval flows

## Memory Format

Each memory is one markdown bullet line:

```md
- Okta impossible travel triage :: Correlate device posture before escalating to identity incident. <!-- {"id":"mem_okta_travel","kind":"alert_pattern","scope":["identity","okta"],"priority":"high","status":"active","updatedAt":"2026-04-23T06:00:00.000Z","source":"analyst_review"} -->
```

The title comes first so an agent can scan only the first 20-30 characters of each line and still find relevant memories quickly.

## Quick Start

```js
import { SocMemoryStore } from "./src/index.js";

const store = new SocMemoryStore({
  filePath: "./memory/soc-memory.md",
  previewLength: 28
});

await store.initialize();

await store.append({
  title: "CrowdStrike lateral movement triage",
  context: "Prioritize remote service creation plus privileged token access on the same host.",
  kind: "playbook",
  scope: ["endpoint", "lateral-movement"],
  priority: "high",
  source: "detection-engineering"
});

const result = await store.retrieveRelevant({
  query: "lateral movement remote service token access",
  kinds: ["playbook"],
  limit: 3
});

console.log(result);
```

## API

### `new SocMemoryStore(options)`

- `filePath`: markdown file path
- `previewLength`: prefix length used during lightweight scanning

### `initialize()`

Creates the memory file if needed and builds the byte-offset preview index.

### `listPreviews(filters = {})`

Returns preview-only entries without parsing full lines unless needed by filters.

### `retrieveRelevant(options)`

Two-stage retrieval:

1. rank records by preview/title overlap
2. lazy-load only shortlisted lines and rerank using full context + metadata

### `append(memory)`

Appends a new memory line and refreshes the index.

### `updateById(id, patch)`

Rewrites one matching line while preserving the markdown line-store format.

### `archiveById(id, reason = "archived")`

Marks the record as archived in metadata and annotates the context.

## Run

```bash
node --test
node ./examples/basic.js
```
