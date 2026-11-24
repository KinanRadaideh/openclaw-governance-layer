// Mutation sweep for the 2026-11-24 fixes (T47 6i.10, 6i.11, 6i.13, 6i.16, 6i.17, 6i.19).
// Each mutation reverts one fix; the named test file must then FAIL. Run from the repo root.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const muts = [
  {
    id: "M1 6i.11 revoke on delete",
    file: "src/gateway/server-methods/agents.ts",
    from: "    revokeOpenClawAgentDatabaseValidation(databasePath);\n",
    to: "",
    cwd: ".",
    test: "src/gateway/server-methods/agents-mutate.test.ts",
    // the file has 30 unrelated Windows-path failures; only this test is the judge
    filter: "cleans a relocated deleted-agent database",
  },
  {
    id: "M2 6i.16 regex reason",
    file: "src/governance/rule-validation.ts",
    from: '${reason ? ` (${reason})` : ""}',
    to: "",
    cwd: ".",
    test: "src/governance/rule-validation-regex-message.test.ts",
  },
  {
    id: "M3 6i.19 governance wording",
    file: "src/agents/agent-tools.before-tool-call.approval.ts",
    from: 'approval.pluginId === GOVERNANCE_APPROVAL_PLUGIN_ID\n    ? "Denied by an Administrator',
    to: 'false\n    ? "Denied by an Administrator',
    cwd: ".",
    test: "src/agents/agent-tools.before-tool-call.denied-reason.test.ts",
  },
  {
    id: "M4 6i.17 stale exception kept",
    file: "ui/src/pages/governance/panels/grant-title.ts",
    from: "  if (kept.length === named.length) {",
    to: "  if (true) {",
    cwd: "ui",
    test: "src/pages/governance/panels/grant-title.test.ts",
  },
  {
    id: "M5 6i.10 earlier rule not named",
    file: "ui/src/pages/governance/panels/grant-title.ts",
    from: '  return earlier ? ` (${currentRuleTitle(earlier, rules)})` : "";',
    to: '  return "";',
    cwd: "ui",
    test: "src/pages/governance/panels/grant-title.test.ts",
  },
  {
    id: "M6 6i.13 refusal not in row notice",
    file: "ui/src/pages/governance/panels/agent-registry-panels.ts",
    from: "                    throw error;\n                  });",
    to: "                    throw error;\n                  }).then((r) => r);",
    cwd: "ui",
    test: "src/pages/governance/agent-delete-choice.test.ts",
    // the mutation removes the onDraft call itself
    alt: {
      from: "                      rowNoticeWarning: true,\n                    });\n                    throw error;",
      to: "                    });\n                    throw error;",
    },
  },
  {
    id: "M7 created-notice kept after delete",
    file: "ui/src/pages/governance/panels/agent-registry-panels.ts",
    from: '                    provisionNotice: "",\n                    provisionNoticeWarning: false,\n                  });',
    to: "                  });",
    cwd: "ui",
    test: "src/pages/governance/agent-delete-choice.test.ts",
  },
  {
    id: "M8 grant exception not tied to its own grant",
    file: "ui/src/pages/governance/panels/grant-title.ts",
    from: "        other.description.startsWith(lead) &&\n",
    to: "",
    cwd: "ui",
    test: "src/pages/governance/panels/grant-title.test.ts",
  },
];

let survived = 0;
for (const m of muts) {
  const original = fs.readFileSync(m.file, "utf8");
  const spec = m.alt ?? m;
  if (!original.includes(spec.from)) {
    console.log(`${m.id}: PATTERN NOT FOUND`);
    survived += 1;
    continue;
  }
  fs.writeFileSync(
    m.file,
    original.replace(spec.from, () => spec.to),
  );
  let failed = false;
  try {
    execFileSync(
      "node",
      [
        `${m.cwd === "ui" ? "../" : ""}node_modules/vitest/vitest.mjs`,
        "run",
        ...(m.cwd === "ui" ? ["--project", "unit"] : []),
        m.test,
        ...(m.filter ? ["-t", m.filter] : []),
      ],
      { cwd: m.cwd, stdio: "pipe", timeout: 240000 },
    );
  } catch {
    failed = true;
  } finally {
    fs.writeFileSync(m.file, original);
  }
  console.log(`${m.id}: ${failed ? "killed" : "SURVIVED"}`);
  if (!failed) {
    survived += 1;
  }
}
console.log(survived === 0 ? "all killed" : `${survived} not killed`);
