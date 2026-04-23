import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { SocMemoryStore } from "../src/index.js";

async function createStore(testName) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `soc-memory-${testName}-`));
  const filePath = path.join(root, "soc-memory.md");
  const store = await new SocMemoryStore({ filePath, previewLength: 24 }).initialize();

  await store.append({
    id: "mem_1",
    title: "Okta impossible travel triage",
    context: "Check device posture and known VPN egress before escalation.",
    kind: "alert_pattern",
    scope: ["identity", "okta"],
    priority: "high",
    source: "analyst_review"
  });

  await store.append({
    id: "mem_2",
    title: "AWS GuardDuty crypto miner investigation",
    context: "Correlate instance role abuse with outbound mining pool traffic.",
    kind: "playbook",
    scope: ["cloud", "aws"],
    priority: "critical",
    source: "incident_review"
  });

  await store.append({
    id: "mem_3",
    title: "Archive noisy SSO impossible travel edge case",
    context: "Legacy mobile VPN route caused repeated benign impossible travel alerts.",
    kind: "tuning_note",
    scope: ["identity", "sso"],
    priority: "low",
    status: "archived",
    source: "tuning"
  });

  return { root, filePath, store };
}

test("builds preview index without loading full corpus", async () => {
  const { store } = await createStore("index");
  const previews = await store.listPreviews();

  assert.equal(previews.length, 3);
  assert.match(previews[0].preview, /^- Okta impossible travel/);
  assert.equal(typeof previews[0].startOffset, "number");
});

test("retrieves relevant active memories using preview shortlist and full rerank", async () => {
  const { store } = await createStore("retrieve");
  const result = await store.retrieveRelevant({
    query: "crypto miner outbound traffic",
    limit: 2
  });

  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].id, "mem_2");
  assert.equal(result.telemetry.previewScanCount, 2);
  assert.equal(result.telemetry.fullLoadCount, 2);
});

test("updates and archives memories by id", async () => {
  const { store } = await createStore("mutations");
  const updated = await store.updateById("mem_1", {
    context: "Escalate only after validating VPN egress against known employee patterns."
  });

  assert.match(updated.context, /VPN egress/);

  const archived = await store.archiveById("mem_2", "superseded");

  assert.equal(archived.status, "archived");
  assert.match(archived.context, /archive_reason=superseded/);
});
