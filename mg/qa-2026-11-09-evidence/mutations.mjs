// Mutation sweep for findings 452 and 453 (QA of 2026-11-09). Each mutant puts one piece of a
// fix back the way it was; the named test file must then fail. Files are restored after each.
// Run from the repo root: node mg/qa-2026-11-09-evidence/mutations.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const mutants = [
  {
    id: "M1 command cut back",
    file: "src/governance/resource-extraction.ts",
    from: "  return command ? [command] : [];",
    to: "  return command ? [command.slice(0, 2048)] : [];",
    test: "src/governance/resource-length.test.ts",
  },
  {
    id: "M2 terminal data cut back",
    file: "src/governance/resource-extraction.ts",
    from: '    resources.push(data.replace(/\\r?\\n$/, ""));',
    to: '    resources.push(data.replace(/\\r?\\n$/, "").slice(0, 2048));',
    test: "src/governance/resource-length.test.ts",
  },
  {
    id: "M3 canonical URL cut back",
    file: "src/governance/url-rules.ts",
    from: "  return canonical;\n",
    to: "  return canonical.slice(0, 2048);\n",
    test: "src/governance/resource-length.test.ts",
  },
  {
    id: "M4 gate stops repairing addresses",
    file: "src/governance/resource-extraction.ts",
    from: "addresses(event).map(repairNetworkAddress)",
    to: "addresses(event)",
    test: "src/governance/network-address-repair.test.ts",
  },
  {
    id: "M6 tool and gate repair differ (tool keeps its own trim only)",
    file: "src/infra/net/web-fetch-url.ts",
    from: '  const repaired = trimmed.replace(/^(https?:\\/\\/)\\s+/i, "$1");',
    to: "  const repaired = trimmed;",
    test: "src/governance/network-address-repair.test.ts",
  },
  {
    id: "M8 held question stored unredacted (454)",
    file: "src/governance/pending-decisions.ts",
    from: "  const redacted = redactLedgerText(input.resource);",
    to: "  const redacted = input.resource;",
    test: "src/governance/escalation-secret.test.ts",
  },
  {
    id: "M9 proposal files a request carrying a secret (454)",
    file: "src/governance/policy-engine.ts",
    from: "  if (input.containsSecret === true || redactLedgerText(input.resource) !== input.resource) {",
    to: "  if (input.containsSecret === true) {",
    test: "src/governance/escalation-secret.test.ts",
  },
  {
    id: "M10 proposal ignores the held question's mark (454)",
    file: "src/governance/policy-engine.ts",
    from: "  if (input.containsSecret === true || redactLedgerText(input.resource) !== input.resource) {",
    to: "  if (redactLedgerText(input.resource) !== input.resource) {",
    test: "src/governance/escalation-secret.test.ts",
  },
];

const results = [];
for (const mutant of mutants) {
  const original = readFileSync(mutant.file, "utf8");
  const parts = original.split(mutant.from);
  if (parts.length !== 2) {
    results.push(`${mutant.id}: SETUP ERROR (target found ${parts.length - 1} times)`);
    continue;
  }
  writeFileSync(mutant.file, parts.join(mutant.to));
  let outcome;
  try {
    execFileSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", mutant.test], {
      stdio: "pipe",
      timeout: 600_000,
    });
    outcome = "SURVIVED";
  } catch {
    outcome = "killed";
  } finally {
    writeFileSync(mutant.file, original);
  }
  results.push(`${mutant.id}: ${outcome}`);
  console.log(results.at(-1));
}
writeFileSync("mg/qa-2026-11-09-evidence/mutations-result.txt", `${results.join("\n")}\n`);
