// T94 mutation sweep: each mutant removes one protection; its tests must fail. The file is
// restored after every mutant, whatever happens. Run from the repo root.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const CORE = ["test/vitest/vitest.unit.config.ts", "src/governance/follow-on-requests.test.ts"];
const BROWSER = [
  "test/vitest/vitest.extension-browser.config.ts",
  "extensions/browser/src/browser/governed-page-requests.chrome.test.ts",
];

const mutants = [
  [
    "M1 web_fetch hop not judged",
    "src/infra/net/fetch-guard.ts",
    "await params.beforeRedirect(nextUrl);",
    "void 0;",
    CORE,
  ],
  [
    "M2 refused hop handed to provider",
    "src/agents/tools/web-fetch.ts",
    "error instanceof followOnRequests.FollowOnRequestRefusedError",
    "false",
    CORE,
  ],
  [
    "M3 cached final address not re-judged",
    "src/agents/tools/web-fetch.ts",
    "await beforeRedirect(cachedFinalUrl);",
    "void cachedFinalUrl;",
    CORE,
  ],
  [
    "M4 page requests judged in full",
    "src/governance/policy-engine.ts",
    "if (part?.denialsOnly) {\n    return undefined;\n  }",
    "",
    CORE,
  ],
  [
    "M5 via not recorded",
    "src/governance/policy-engine.ts",
    "...(part?.via ? { via: part.via } : {})",
    "",
    CORE,
  ],
  [
    "M6 repeated refusal recorded every time",
    "src/governance/follow-on-requests.ts",
    "rememberRefusal(repeatKey, reason, now);",
    "void reason;",
    CORE,
  ],
  [
    "M7 non-network scheme judged",
    "src/governance/follow-on-requests.ts",
    "return NETWORK_SCHEMES.has(new URL(url).protocol);",
    "return Boolean(new URL(url));",
    CORE,
  ],
  [
    "M8 evaluate not its own resource",
    "src/governance/resource-extraction.ts",
    "resources.push(BROWSER_SCRIPT_RESOURCE);",
    "void 0;",
    CORE,
  ],
  [
    "M9 via hash dropped",
    "src/governance/audit-ledger.ts",
    "const withVia = e.via === undefined ? withUrl : [...withUrl, `via:${e.via}`];",
    "const withVia = withUrl;",
    CORE,
  ],
  [
    "M10 verifier ignores via",
    "scripts/verify-ledger.mjs",
    "const withVia = e.via === undefined ? withUrl : [...withUrl, `via:${e.via}`];",
    "const withVia = withUrl;",
    CORE,
  ],
  [
    "M11 named address judged again (D3)",
    "extensions/browser/src/browser/governed-page-requests.ts",
    "owners.every((owner) => owner.isRunning() && owner.names(url))",
    "false",
    BROWSER,
  ],
  [
    "M12 no redirect guard",
    "extensions/browser/src/browser/governed-page-requests.ts",
    "await guardRedirects(page);",
    "void 0;",
    BROWSER,
  ],
  [
    "M13 no WebSocket guard",
    "extensions/browser/src/browser/governed-page-requests.ts",
    "await page.routeWebSocket(/.*/, (socket) => handleWebSocket(page, socket));",
    "void 0;",
    BROWSER,
  ],
  [
    "M14 popup not adopted",
    "extensions/browser/src/browser/governed-page-requests.ts",
    "await adoptFromOpener(page);",
    "void 0;",
    BROWSER,
  ],
  [
    "M15 popup adoption on page event only, no route adoption",
    "extensions/browser/src/browser/governed-page-requests.ts",
    "  await adoptFromOpener(page);\n",
    "",
    BROWSER,
  ],
  [
    "M16 every request a page request",
    "extensions/browser/src/browser/governed-page-requests.ts",
    'const via: FollowOnVia = isMainFrameDocument(request, page) ? "navigation" : "page";',
    'const via: FollowOnVia = "page";',
    BROWSER,
  ],
  [
    "M17 upstream guard ends the chain",
    "extensions/browser/src/browser/pw-session-navigation.ts",
    "    if (!requestKind) {\n      await fallbackRouteSafely(route);",
    "    if (!requestKind) {\n      await route.continue();",
    BROWSER,
  ],
  [
    "M18 unowned page judged as everyone's",
    "extensions/browser/src/browser/governed-page-requests.ts",
    "  if (page) {\n    // A page no governed call has touched",
    "  if (false) {\n    // A page no governed call has touched",
    BROWSER,
  ],
];

const only = process.argv[2];
const results = [];
for (const [name, file, from, to, [config, test]] of mutants) {
  if (only && !name.startsWith(only)) {
    continue;
  }
  const original = fs.readFileSync(file, "utf8");
  if (!original.includes(from)) {
    results.push(`${name}: MUTATION TEXT NOT FOUND`);
    continue;
  }
  fs.writeFileSync(file, original.replace(from, to));
  let killed;
  try {
    execFileSync(
      process.execPath,
      ["node_modules/vitest/vitest.mjs", "run", "--config", config, test],
      {
        stdio: "pipe",
        timeout: 300_000,
      },
    );
    killed = false;
  } catch {
    killed = true;
  } finally {
    fs.writeFileSync(file, original);
  }
  results.push(`${name}: ${killed ? "killed" : "SURVIVED"}`);
  console.log(results.at(-1));
}
console.log(`\n${results.filter((r) => r.endsWith("killed")).length}/${results.length} killed`);
