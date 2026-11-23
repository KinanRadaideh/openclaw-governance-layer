import { spawnSync } from "node:child_process";
// Mutation sweep for the 2026-11-23 T47 fixes: break each fix, the named test file must fail.
import { readFileSync, writeFileSync } from "node:fs";

const muts = [
  {
    name: "M1 server-chat: lookup for every event",
    file: "src/gateway/server-chat.ts",
    from: "lifecyclePhase !== null && restartRecoverySessionKey\n        ? resolveRestartRecoveryLifecycleState(",
    to: "restartRecoverySessionKey\n        ? resolveRestartRecoveryLifecycleState(",
    tests: ["src/gateway/server-chat.agent-events.test.ts"],
    cwd: ".",
  },
  {
    name: "M2 rule-agents: ignore the registry",
    file: "src/gateway/governance-dashboard-api.ts",
    from: "...live.sessions.map((entry) => entry.agentId),\n        ...registeredAgentIds,",
    to: "...live.sessions.map((entry) => entry.agentId),",
    tests: ["src/gateway/governance-policy-views.test.ts"],
    cwd: ".",
  },
  {
    name: "M3 conflicts: read equals write",
    file: "src/governance/rule-conflicts.ts",
    from: "scopeCovers(rule, candidate) &&\n        accessCovers(rule, candidate),",
    to: "scopeCovers(rule, candidate),",
    tests: ["src/governance/rule-conflicts.test.ts"],
    cwd: ".",
  },
  {
    name: "M4 request preview: drop access",
    file: "src/gateway/governance-dashboard-rule-requests.ts",
    from: "...(request.access ? { access: request.access } : {}),\n        // With the lifetime",
    to: "// With the lifetime",
    tests: ["src/gateway/governance-rule-request-preview.test.ts"],
    cwd: ".",
  },
  {
    name: "M5 locked refusal wording",
    file: "src/governance/agent-conversation.ts",
    from: "An Administrator can release it under Emergency kill switch; then you can prompt it again.",
    to: "Release it before prompting.",
    tests: ["src/governance/agent-conversation.test.ts"],
    cwd: ".",
  },
  {
    name: "M6 agentLabel case-sensitive",
    file: "ui/src/pages/governance/agent-directory.ts",
    from: "const wanted = agentId.trim().toLowerCase();",
    to: "const wanted = agentId;",
    tests: ["pages/governance/kill-switch-confirm.test.ts"],
    cwd: "ui",
    ui: true,
  },
];

const only = process.argv[2];
let survivors = 0;
for (const m of muts) {
  if (only && !m.name.startsWith(only)) {
    continue;
  }
  const src = readFileSync(m.file, "utf8");
  if (!src.includes(m.from)) {
    console.log(`${m.name}: PATTERN NOT FOUND`);
    survivors++;
    continue;
  }
  writeFileSync(
    m.file,
    src.replace(m.from, () => m.to),
  );
  try {
    const args = m.ui
      ? ["../node_modules/vitest/vitest.mjs", "run", "--project", "unit", ...m.tests]
      : ["node_modules/vitest/vitest.mjs", "run", ...m.tests];
    const r = spawnSync("node", args, { cwd: m.cwd, encoding: "utf8", timeout: 280000 });
    const killed = r.status !== 0;
    console.log(`${m.name}: ${killed ? "KILLED" : "SURVIVED"}`);
    if (!killed) {
      survivors++;
    }
  } finally {
    writeFileSync(m.file, src);
  }
}
console.log(`survivors: ${survivors}`);
