// T95/T96 mutation sweep (2026-11-09). Each mutation reverts or breaks one decision; a test must
// fail for every one. Restores each file afterwards, whatever happens.
// Run from the repo root: node mg/t95-t96-evidence/mutations.mjs [name filter regex]
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const CORE_TESTS = [
  "src/governance/rule-retention-and-removal-audit.test.ts",
  "src/governance/rule-expiry.test.ts",
];
const STORE = "src/governance/policy-store.ts";
const TEXT = "src/governance/rule-ledger-text.ts";
const UI = "ui/src/pages/governance/panels/rule-check.ts";

const ONLY = process.argv[2] ? new RegExp(process.argv[2]) : undefined;
const mutations = [
  {
    name: "M1 T95: addRule prunes every expired rule again",
    file: STORE,
    from: "    if (doc.rules.length >= MAX_POLICY_RULES) {\n      const now",
    to: "    doc.rules = doc.rules.filter((r) => !isRuleExpired(r, Date.now()));\n    if (doc.rules.length >= MAX_POLICY_RULES) {\n      const now",
  },
  {
    name: "M2 D2: ceiling refusal no longer counts expired rules",
    file: STORE,
    from: "throw new TooManyRulesError(overflowed);",
    to: "throw new TooManyRulesError();",
  },
  {
    name: "M3 D3: removeRule writes no status",
    file: STORE,
    from: "target: describeRule(removed, { status: expiryStatusAtRemoval(removed, removedAtMs) }),",
    to: "target: describeRule(removed),",
  },
  {
    name: "M4 D3: status judged at time 0 instead of the removal instant",
    file: STORE,
    from: "    removedAtMs = Date.now();\n    doc.rules = doc.rules.filter((r) => r.id !== ruleId);",
    to: "    doc.rules = doc.rules.filter((r) => r.id !== ruleId);",
  },
  {
    name: "M5 D3: boundary off by one (expired only after the instant)",
    file: TEXT,
    from: "  if (!isRuleExpired(rule, nowMs)) {",
    to: "  if (!isRuleExpired(rule, nowMs - 1)) {",
  },
  {
    name: "M6 D3: unreadable expiry reported as plain expired",
    file: TEXT,
    from: '    ? "expired-unreadable"',
    to: '    ? "expired"',
  },
  {
    name: "M7 D3: status written after the description",
    file: TEXT,
    from: "(${scope}, ${expiry}${removed}); description: ${rule.description}`",
    to: "(${scope}, ${expiry}); description: ${rule.description}${removed}`",
  },
  {
    name: "M8 D4: agent deletion writes no per-rule removal",
    file: STORE,
    from: "  for (const rule of removedRules) {",
    to: "  for (const rule of removedRules.slice(0, 0)) {",
  },
  {
    name: "M9 D4: per-rule removal lacks 'removed with the agent'",
    file: STORE,
    from: "        withAgent: true,\n",
    to: "",
  },
  {
    name: "M10 D5: UI reads an unreadable expiry as live again",
    file: UI,
    from: "return Boolean(rule.expiresAt) && !(Date.parse(rule.expiresAt as string) > nowMs);",
    to: "return Boolean(rule.expiresAt) && Date.parse(rule.expiresAt as string) <= nowMs;",
    ui: true,
  },
  {
    name: "M11 D6: an expired rule's Remove dialog says the agent loses a permission again",
    file: "ui/src/pages/governance/panels/policy-panels.ts",
    from: "message: ruleHasExpired(rule)",
    to: "message: false",
    ui: true,
  },
];

const results = [];
for (const m of mutations.filter((x) => !ONLY || ONLY.test(x.name))) {
  const original = fs.readFileSync(m.file, "utf8");
  if (original.split(m.from).length !== 2) {
    results.push(`${m.name}: SETUP FAILED (pattern not found exactly once)`);
    continue;
  }
  fs.writeFileSync(
    m.file,
    original.replace(m.from, () => m.to),
  );
  try {
    const run = m.ui
      ? spawnSync(
          process.execPath,
          [
            "../node_modules/vitest/vitest.mjs",
            "run",
            "--project",
            "unit",
            "src/pages/governance/rule-notice-unreadable-expiry.test.ts",
            "src/pages/governance/rule-remove-expired-dialog.test.ts",
          ],
          { cwd: "ui", encoding: "utf8" },
        )
      : spawnSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", ...CORE_TESTS], {
          encoding: "utf8",
        });
    const out = `${run.stdout}\n${run.stderr}`;
    const failed = /Tests\s+(\d+) failed/.exec(out)?.[1];
    results.push(
      `${m.name}: ${run.status !== 0 ? `KILLED (${failed ?? "?"} failing)` : "SURVIVED"}`,
    );
  } finally {
    fs.writeFileSync(m.file, original);
  }
}
console.log(results.join("\n"));
