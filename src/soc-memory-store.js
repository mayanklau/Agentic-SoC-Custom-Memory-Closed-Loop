import { promises as fs } from "node:fs";
import path from "node:path";

const LINE_PREFIX = "- ";
const TITLE_DELIMITER = " :: ";
const META_OPEN = "<!-- ";
const META_CLOSE = " -->";

function normalizeWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function escapeField(value) {
  return normalizeWhitespace(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("::", "\\::");
}

function unescapeField(value) {
  let result = "";

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    const next = value[index + 1];

    if (current === "\\" && next) {
      result += next;
      index += 1;
      continue;
    }

    result += current;
  }

  return normalizeWhitespace(result);
}

function splitUnescapedDelimiter(value, delimiter) {
  for (let index = 0; index <= value.length - delimiter.length; index += 1) {
    if (value[index] === "\\") {
      index += 1;
      continue;
    }

    if (value.slice(index, index + delimiter.length) === delimiter) {
      return [value.slice(0, index), value.slice(index + delimiter.length)];
    }
  }

  return [value, ""];
}

function tokenize(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .split(/[^a-z0-9_/-]+/i)
    .filter(Boolean);
}

function overlapScore(needleTokens, haystackText) {
  const haystackTokens = new Set(tokenize(haystackText));

  if (needleTokens.length === 0 || haystackTokens.size === 0) {
    return 0;
  }

  let hits = 0;

  for (const token of needleTokens) {
    if (haystackTokens.has(token)) {
      hits += 1;
    }
  }

  return hits / needleTokens.length;
}

function assertMemoryShape(memory) {
  const title = normalizeWhitespace(memory.title);
  const context = normalizeWhitespace(memory.context);

  if (!title) {
    throw new Error("Memory title is required");
  }

  if (!context) {
    throw new Error("Memory context is required");
  }

  if (title.length > 140) {
    throw new Error("Memory title must stay compact enough for preview scanning");
  }
}

function toMemoryLine(memory) {
  assertMemoryShape(memory);

  const title = escapeField(memory.title);
  const context = escapeField(memory.context);
  const metadata = {
    id: memory.id ?? `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: memory.kind ?? "note",
    scope: Array.isArray(memory.scope) ? memory.scope : [],
    priority: memory.priority ?? "medium",
    status: memory.status ?? "active",
    updatedAt: memory.updatedAt ?? new Date().toISOString(),
    source: memory.source ?? "unknown"
  };

  return `${LINE_PREFIX}${title}${TITLE_DELIMITER}${context} ${META_OPEN}${JSON.stringify(metadata)}${META_CLOSE}`;
}

function parseMemoryLine(line, indexEntry = null) {
  const trimmed = line.trim();

  if (!trimmed.startsWith(LINE_PREFIX)) {
    return null;
  }

  const metaStart = trimmed.lastIndexOf(META_OPEN);
  const metaEnd = trimmed.lastIndexOf(META_CLOSE);

  if (metaStart === -1 || metaEnd === -1 || metaEnd <= metaStart) {
    throw new Error(`Invalid memory metadata block on line ${indexEntry?.lineNumber ?? "unknown"}`);
  }

  const content = trimmed.slice(LINE_PREFIX.length, metaStart).trimEnd();
  const metadataJson = trimmed.slice(metaStart + META_OPEN.length, metaEnd).trim();
  const [rawTitle, rawContext] = splitUnescapedDelimiter(content, TITLE_DELIMITER);
  const metadata = JSON.parse(metadataJson);

  return {
    lineNumber: indexEntry?.lineNumber ?? null,
    startOffset: indexEntry?.startOffset ?? null,
    endOffset: indexEntry?.endOffset ?? null,
    preview: indexEntry?.preview ?? trimmed.slice(0, 30),
    title: unescapeField(rawTitle),
    context: unescapeField(rawContext),
    ...metadata
  };
}

async function ensureDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function ensureFile(filePath) {
  await ensureDirectory(filePath);

  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "", "utf8");
  }
}

function buildIndexEntries(content, previewLength) {
  const entries = [];
  const matcher = /([^\n]*)(\n|$)/g;
  let lineNumber = 0;
  let startOffset = 0;
  let match;

  while ((match = matcher.exec(content)) !== null) {
    const [segment, line, newline] = match;
    lineNumber += 1;
    const endOffset = startOffset + Buffer.byteLength(line);
    const preview = line.slice(0, previewLength);
    const titlePreview = line.startsWith(LINE_PREFIX)
      ? line.slice(LINE_PREFIX.length, LINE_PREFIX.length + previewLength)
      : preview;

    if (line.trim()) {
      entries.push({
        lineNumber,
        startOffset,
        endOffset,
        preview,
        titlePreview
      });
    }

    if (!segment) {
      break;
    }

    startOffset = endOffset + Buffer.byteLength(newline);

    if (newline === "" && matcher.lastIndex >= content.length) {
      break;
    }
  }

  return entries;
}

export class SocMemoryStore {
  constructor({ filePath, previewLength = 30 }) {
    this.filePath = filePath;
    this.previewLength = previewLength;
    this.index = [];
  }

  async initialize() {
    await ensureFile(this.filePath);
    await this.refreshIndex();
    return this;
  }

  async refreshIndex() {
    const content = await fs.readFile(this.filePath, "utf8");
    this.index = buildIndexEntries(content, this.previewLength);
    return this.index;
  }

  async listPreviews({ status, kinds, scope } = {}) {
    const normalizedKinds = kinds ? new Set(kinds) : null;
    const normalizedScope = scope ? new Set(scope) : null;
    const previews = [];

    for (const entry of this.index) {
      if (!status && !normalizedKinds && !normalizedScope) {
        previews.push(entry);
        continue;
      }

      const record = await this.#readEntry(entry);

      if (status && record.status !== status) {
        continue;
      }

      if (normalizedKinds && !normalizedKinds.has(record.kind)) {
        continue;
      }

      if (normalizedScope && !record.scope?.some((item) => normalizedScope.has(item))) {
        continue;
      }

      previews.push(entry);
    }

    return previews;
  }

  async retrieveRelevant({ query, kinds, scope, status = "active", limit = 5, shortlistSize = 10 } = {}) {
    const needleTokens = tokenize(query);
    const filteredPreviews = await this.listPreviews({ status, kinds, scope });
    const previewRanked = filteredPreviews
      .map((entry) => ({
        entry,
        previewScore: overlapScore(needleTokens, `${entry.preview} ${entry.titlePreview}`)
      }))
      .sort((left, right) => right.previewScore - left.previewScore)
      .slice(0, shortlistSize);

    const loaded = [];

    for (const candidate of previewRanked) {
      const memory = await this.#readEntry(candidate.entry);
      const fullScore = overlapScore(needleTokens, `${memory.title} ${memory.context} ${memory.scope?.join(" ") ?? ""}`);
      const priorityBoost = memory.priority === "critical" ? 0.2 : memory.priority === "high" ? 0.1 : 0;

      loaded.push({
        ...memory,
        retrieval: {
          previewScore: candidate.previewScore,
          fullScore,
          score: fullScore + priorityBoost
        }
      });
    }

    const results = loaded
      .sort((left, right) => right.retrieval.score - left.retrieval.score)
      .slice(0, limit);

    return {
      query,
      telemetry: {
        previewScanCount: filteredPreviews.length,
        fullLoadCount: loaded.length,
        previewToFullRatio: filteredPreviews.length === 0 ? 0 : loaded.length / filteredPreviews.length
      },
      results
    };
  }

  async append(memory) {
    const line = toMemoryLine(memory);
    const prefix = this.index.length === 0 ? "" : "\n";

    await fs.appendFile(this.filePath, `${prefix}${line}`, "utf8");
    await this.refreshIndex();

    return line;
  }

  async getById(id) {
    for (const entry of this.index) {
      const memory = await this.#readEntry(entry);

      if (memory.id === id) {
        return memory;
      }
    }

    return null;
  }

  async updateById(id, patch) {
    const lines = await this.#readAllLines();
    let updated = false;

    const nextLines = lines.map((line) => {
      if (!line.trim()) {
        return line;
      }

      const parsed = parseMemoryLine(line);

      if (parsed.id !== id) {
        return line;
      }

      updated = true;

      return toMemoryLine({
        ...parsed,
        ...patch,
        id,
        updatedAt: new Date().toISOString()
      });
    });

    if (!updated) {
      return null;
    }

    await fs.writeFile(this.filePath, nextLines.join("\n"), "utf8");
    await this.refreshIndex();

    return this.getById(id);
  }

  async archiveById(id, reason = "archived") {
    const existing = await this.getById(id);

    if (!existing) {
      return null;
    }

    const nextContext = `${existing.context} [archive_reason=${reason}]`;

    return this.updateById(id, {
      status: "archived",
      context: nextContext
    });
  }

  async #readEntry(entry) {
    const handle = await fs.open(this.filePath, "r");

    try {
      const length = Math.max(0, entry.endOffset - entry.startOffset);
      const buffer = Buffer.alloc(length);

      await handle.read(buffer, 0, length, entry.startOffset);

      return parseMemoryLine(buffer.toString("utf8"), entry);
    } finally {
      await handle.close();
    }
  }

  async #readAllLines() {
    const content = await fs.readFile(this.filePath, "utf8");
    return content.split("\n");
  }
}
