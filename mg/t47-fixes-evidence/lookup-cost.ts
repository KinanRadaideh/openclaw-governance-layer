// How much main-thread time one per-event session lookup costs, in an empty temporary state dir.
// A lower bound: the VPS has more agents and sessions than this.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "oc-lookup-cost-"));
process.env.OPENCLAW_STATE_DIR = dir;
process.env.OPENCLAW_CONFIG_PATH = join(dir, "openclaw.json");

const { loadSessionEntryReadOnly } = await import("../../src/gateway/session-utils.js");

const N = 2000;
const key = "agent:main:governance:usertest";
loadSessionEntryReadOnly(key, { agentId: "main", clone: false });
const t0 = process.hrtime.bigint();
for (let i = 0; i < N; i += 1) {
  loadSessionEntryReadOnly(key, { agentId: "main", clone: false });
}
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(`${N} lookups: ${ms.toFixed(0)} ms total, ${(ms / N).toFixed(3)} ms each (blocking)`);
