# PRD: Prefix-Indexed Memory Component for Agentic SOC

## Summary

Build a production-grade memory component that lets SOC agents scan hundreds of durable memories cheaply, identify relevant records from short title prefixes, and fetch full memory details only when required for the active task.

## Problem

Agentic SOC systems need reusable memory, but naively loading the full memory corpus for every task burns tokens, slows routing, and increases noise. Security work also depends on structured context: alerts, detections, incident learnings, playbook steps, environment-specific quirks, and risk signals.

The memory system should therefore:

- keep memory records human-editable
- make the first 20-30 characters meaningful enough for fast triage
- allow fast lightweight scanning across hundreds of records
- only load full details for shortlisted candidates
- preserve metadata needed for SOC governance and filtering

## Users

- SOC investigation agents
- detection engineering agents
- response orchestration agents
- human analysts supervising agent output

## Primary Use Cases

1. An alert triage agent scans memory previews to find playbooks or historical false-positive patterns relevant to the alert.
2. A detection-writing agent pulls prior incident learnings and tuning notes before creating new rules.
3. A response agent loads only the memories relevant to the affected asset, identity provider, cloud account, or attack technique.
4. A supervisor agent archives stale memories and updates active guidance after incidents close.

## Product Goals

- Reduce average memory tokens loaded per task.
- Improve memory retrieval precision for agent workflows.
- Keep the source of truth editable in git-friendly markdown.
- Support operational metadata without losing the title-first preview pattern.

## Non-Goals

- vector database replacement
- long-form document storage
- multi-line markdown note editing
- real-time collaborative editing

## Functional Requirements

1. Store one memory per markdown line.
2. Enforce title-first serialization with structured context after a delimiter.
3. Persist structured metadata per memory:
   - `id`
   - `kind`
   - `scope`
   - `priority`
   - `status`
   - `source`
   - `updatedAt`
4. Build a preview index without parsing all full records into runtime context.
5. Support byte-offset lookup so full lines can be fetched lazily.
6. Retrieve relevant memories using a two-stage strategy:
   - cheap preview scan
   - full-record rerank on shortlisted candidates
7. Support append, update, and archive workflows.
8. Be deterministic and testable without external services.

## Non-Functional Requirements

- Human-readable storage format
- Safe for files with hundreds to low thousands of lines
- Works without third-party dependencies
- Stable parsing and escaping
- Easy to wrap in larger agent runtimes

## Data Model

Markdown line:

```md
- <title> :: <context> <!-- {"id":"...","kind":"...","scope":["..."],"priority":"high","status":"active","updatedAt":"...","source":"..."} -->
```

Rationale:

- Title appears first for preview scanning.
- Context remains readable in plain markdown.
- Metadata lives in an HTML comment so the file stays markdown-compatible.

## Retrieval Flow

1. Scan file and store `lineNumber`, `startOffset`, `endOffset`, `preview`, and `titlePreview`.
2. Score every memory using preview/title token overlap.
3. Lazy-load only the top candidate lines.
4. Parse full context and metadata.
5. Rerank by full-text overlap plus metadata filters.
6. Return top memories with retrieval telemetry.

## Success Metrics

- `preview_scan_count`
- `full_load_count`
- `preview_to_full_ratio`
- retrieval latency
- analyst acceptance / reuse rate

## Risks

- Weak titles reduce preview-stage recall.
- Line-based storage is not ideal for very large corpora.
- Manual edits can break metadata if format is not validated.

## Future Extensions

- sidecar manifest for faster id lookups
- file locking for concurrent writers
- hybrid lexical + embedding retrieval
- TTL and confidence decay
- memory compaction / deduplication
