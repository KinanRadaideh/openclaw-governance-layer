// Seeds an isolated governance fixture for the live QA of the T47 fixes (2026-11-23).
// Usage: node_modules/.bin/tsx mg/t47-fixes-evidence/seed-fixture.ts <fixtureDir>
// Test credentials only; they exist nowhere but in this fixture.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const fx = process.argv[2];
if (!fx) {
  throw new Error("fixture dir required");
}
const gov = join(fx, "gov");
const state = join(fx, "state");
mkdirSync(gov, { recursive: true });
mkdirSync(state, { recursive: true });
mkdirSync(join(fx, "ws-main"), { recursive: true });
process.env.OPENCLAW_GOVERNANCE_DIR = gov;

const { createUser, newGroupId } = await import("../../src/governance/user-store.js");
const { registerAgent } = await import("../../src/governance/agent-registry.js");

const groupId = newGroupId();
const actor = { name: "seed", role: "root" } as const;
const pw = `Qa-${Math.random().toString(36).slice(2, 10)}-pass1`;
const root = await createUser({ username: "root-t47", password: pw, role: "root", groupId }, actor);
const admin = await createUser(
  { username: "admin-t47", password: pw, role: "administrator", groupId },
  actor,
);
await createUser(
  { username: "user-t47", password: pw, role: "user", groupId, managedBy: admin.id },
  actor,
);
for (const id of ["zebra-quill", "scout"]) {
  await registerAgent(
    { id, displayName: id === "scout" ? "Scout" : "Zebra Quill", groupId, adminId: admin.id },
    actor,
  );
}

const token = `t47-${Math.random().toString(36).slice(2, 14)}`;
writeFileSync(
  join(state, "openclaw.json"),
  JSON.stringify(
    {
      gateway: { mode: "local", bind: "loopback", auth: { mode: "token", token } },
      agents: { list: [{ id: "main", default: true, workspace: join(fx, "ws-main") }] },
    },
    null,
    2,
  ),
);
writeFileSync(
  join(fx, "accounts.json"),
  JSON.stringify(
    {
      groupId,
      root: { u: "root-t47", p: pw },
      admin: { u: "admin-t47", p: pw },
      user: { u: "user-t47", p: pw },
      token,
    },
    null,
    2,
  ),
);
console.log("seeded", { groupId, root: root.id });
