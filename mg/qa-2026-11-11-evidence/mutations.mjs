// QA 2026-11-11 mutation sweep for T97 and findings 456/457. Each mutant: split/join on one
// file, run the T97 tests, restore. Run from the repo root.
import { execSync } from "node:child_process";
import fs from "node:fs";

const VIEW = "src/governance/installation-ledger-view.ts";
const ROUTE = "src/gateway/governance-dashboard-oversight.ts";
const STR = "ui/src/i18n/locales/en-governance.ts";
const SERVER_TESTS =
  "src/gateway/governance-installation-ledger-view.test.ts src/governance/installation-ledger-view.test.ts";
const UI_TEST = "src/pages/governance/installation-ledger-ui.test.ts";

const mutants = [
  {
    id: "N1 456 GET read error propagates",
    file: VIEW,
    from: "  } catch {\n    return [];\n  }",
    to: "  } catch (e) {\n    throw e;\n  }",
    suite: "server",
  },
  {
    id: "N2 456 verify error propagates",
    file: VIEW,
    from: "  } catch (err) {\n    return { ok: false, entriesChecked: 0, reason: unreadable(err) };\n  }",
    to: "  } catch (err) {\n    throw err;\n  }",
    suite: "server",
  },
  {
    id: "N3 457 old wording back",
    file: STR,
    from: "outside the organisation's chain. That chain holds what belongs to no organisation (an agent nobody registered, the copy of an organisation's deletion) and every failed or locked-out sign-in, which is recorded alike whether or not the name belongs to an account.",
    to: "outside the organisation's chain, because it belongs to no organisation (for example an agent nobody registered, or a sign-in under a name nobody holds).",
    suite: "ui",
  },
  {
    id: "N4 any role reads the chain",
    file: VIEW,
    from: 'if (reader.role !== "root") {',
    to: "if (false) {",
    suite: "server",
  },
  {
    id: "N5 several organisations count as one",
    file: VIEW,
    from: "groups.size === 1 ?",
    to: "groups.size >= 1 ?",
    suite: "server",
  },
  {
    id: "N6 ties to the installation",
    file: VIEW,
    from: "orgTime <= instTime",
    to: "orgTime < instTime",
    suite: "server",
  },
  {
    id: "N7 installation entries unmarked",
    file: VIEW,
    from: "merged.push({ ...fromInstallation, ledgerScope: INSTALLATION_LEDGER_SCOPE });",
    to: "merged.push({ ...fromInstallation });",
    suite: "server",
  },
  {
    id: "N8 installation verify for every reader",
    file: ROUTE,
    from: "if (await mayReadInstallationLedger(session)) {\n      verification.installation",
    to: "if (true) {\n      verification.installation",
    suite: "server",
  },
  {
    id: "N9 chain merged for every reader",
    file: ROUTE,
    from: "const combined = (await mayReadInstallationLedger(session))",
    to: "const combined = true",
    suite: "server",
  },
];

const results = [];
for (const m of mutants) {
  const original = fs.readFileSync(m.file, "utf8");
  const n = original.split(m.from).length - 1;
  if (n !== 1) {
    results.push(`${m.id}: NOT APPLIED (${n} matches)`);
    continue;
  }
  fs.writeFileSync(m.file, original.split(m.from).join(m.to));
  let killed = false;
  try {
    if (m.suite === "server") {
      execSync(`node node_modules/vitest/vitest.mjs run ${SERVER_TESTS}`, {
        stdio: "pipe",
        timeout: 600_000,
      });
    } else {
      execSync(`node ../node_modules/vitest/vitest.mjs run --project unit ${UI_TEST}`, {
        cwd: "ui",
        stdio: "pipe",
        timeout: 300_000,
      });
    }
  } catch {
    killed = true;
  } finally {
    fs.writeFileSync(m.file, original);
  }
  results.push(`${m.id}: ${killed ? "KILLED" : "SURVIVED"}`);
  console.log(results.at(-1));
}
console.log("\n" + results.join("\n"));
