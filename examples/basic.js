import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SocMemoryStore } from "../src/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const memoryPath = path.join(__dirname, "..", "memory", "soc-memory.md");

await fs.rm(path.dirname(memoryPath), { recursive: true, force: true });

const store = await new SocMemoryStore({
  filePath: memoryPath,
  previewLength: 28
}).initialize();

await store.append({
  id: "mem_okta_travel",
  title: "Okta impossible travel triage",
  context: "Correlate device posture before escalating to identity incident.",
  kind: "alert_pattern",
  scope: ["identity", "okta"],
  priority: "high",
  source: "analyst_review"
});

await store.append({
  id: "mem_cs_lateral",
  title: "CrowdStrike lateral movement playbook",
  context: "Prioritize remote service creation plus privileged token access on the same host.",
  kind: "playbook",
  scope: ["endpoint", "lateral-movement"],
  priority: "critical",
  source: "detection_engineering"
});

const result = await store.retrieveRelevant({
  query: "remote service token access lateral movement",
  kinds: ["playbook"],
  limit: 2
});

console.log(JSON.stringify(result, null, 2));
