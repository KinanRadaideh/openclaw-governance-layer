// T95 live run (2026-11-09): stores two rules the dashboard cannot create, through the store's
// own sealed writer (run with the Gateway stopped) (`updatePolicy`), so the Gateway reads them as a normal policy write and not
// as a file edited outside the store. (A first run stored the same two as `path` rules,
// `path-t95-old` and `path-t95-corrupt`; `/tools/invoke` cannot reach a path tool, so they serve
// only as removal cases. These network rules are the ones `web_fetch` exercises.) One expired 30 days ago (past the old seven-day pruning
// window) and one whose expiry does not parse: before T95, the next rule added deleted both.
// Usage (repo root): OPENCLAW_GOVERNANCE_DIR=<gov> node_modules/.bin/tsx mg/t95-t96-evidence/seed-old-expired.ts <groupId>
import { updatePolicy } from "../../src/governance/policy-store.js";

const groupId = process.argv[2];
if (!groupId || !process.env.OPENCLAW_GOVERNANCE_DIR) {
  throw new Error("usage: OPENCLAW_GOVERNANCE_DIR=<dir> tsx seed-old-expired.ts <groupId>");
}
const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
await updatePolicy(groupId, (doc) => {
  doc.rules.push(
    {
      id: "net-t95-old",
      tier: "admin",
      resourceKind: "network",
      effect: "allow",
      pattern: "^127[.]0[.]0[.]2$",
      agentId: "main",
      description: "T95 live: expired 30 days ago (the old add pruned it)",
      createdAt: monthAgo,
      expiresAt: monthAgo,
    },
    {
      id: "net-t95-corrupt",
      tier: "admin",
      resourceKind: "network",
      effect: "allow",
      pattern: "^127[.]0[.]0[.]3$",
      agentId: "main",
      description: "T95 live: unreadable expiry (the old add pruned it at once)",
      createdAt: monthAgo,
      expiresAt: "not-a-date",
    },
  );
});
console.log("stored net-t95-old and net-t95-corrupt");
