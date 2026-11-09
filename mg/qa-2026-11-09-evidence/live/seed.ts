// QA 2026-11-09 live check of findings 452 and 453: isolated Gateway fixture and governance seed.
// Writes the Gateway config (token to a file, never printed) and seeds the governance folder
// through the store's own writers (`registerAgent` via the test seeding helper, `addRule`,
// `setMode`), with the Gateway stopped, so it reads them as normal store writes.
// Usage (repo root): node_modules/.bin/tsx mg/qa-2026-11-09-evidence/live/seed.ts <fixture dir>
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2]?.replaceAll("\\", "/");
if (!root) {
  throw new Error("usage: tsx seed.ts <fixture dir>");
}
for (const dir of ["state", "gov", "home", "ws-main"]) {
  mkdirSync(join(root, dir), { recursive: true });
}
const token = randomBytes(24).toString("hex");
writeFileSync(join(root, "gateway-token.txt"), token);
const config = {
  gateway: { mode: "local", bind: "loopback", auth: { mode: "token", token } },
  agents: { list: [{ id: "main", default: true, workspace: `${root}/ws-main` }] },
  // The upstream SSRF guard is told to allow loopback sites; governance is not relaxed.
  tools: {
    web: { fetch: { cacheTtlMinutes: 0, ssrfPolicy: { dangerouslyAllowPrivateNetwork: true } } },
  },
};
writeFileSync(join(root, "state", "openclaw.json"), `${JSON.stringify(config, null, 2)}\n`);

process.env.OPENCLAW_GOVERNANCE_DIR = `${root}/gov`;
const { seedGroupWithAgents } = await import("../../../src/governance/test-group.js");
const { addRule, setMode } = await import("../../../src/governance/policy-store.js");
const actor = { name: "qa-seed", role: "root" } as const;
const group = await seedGroupWithAgents(["main"]);
await addRule(
  group,
  {
    resourceKind: "network",
    pattern: "^127[.]0[.]0[.]2$",
    effect: "deny",
    description: "QA: forbidden site",
  },
  actor,
);
await addRule(
  group,
  {
    resourceKind: "network",
    pattern: "^127[.]0[.]0[.]3$",
    effect: "allow",
    description: "QA: allowed site",
  },
  actor,
);
await addRule(
  group,
  {
    resourceKind: "url",
    pattern: "^http://127[.]0[.]0[.]3:18898/admin(/|\\?|$)",
    effect: "deny",
    description: "QA: admin pages",
  },
  actor,
);
await addRule(
  group,
  {
    resourceKind: "url",
    pattern: "[?&]format=raw(&|$)",
    effect: "deny",
    description: "QA: raw format",
  },
  actor,
);
await setMode(group, "monitor", actor);
writeFileSync(join(root, "group.txt"), group);
console.log(`seeded group ${group} under ${root}`);
