// Three-surface parity: is every capability reachable from the dashboard, the
// HTTP API and the command line?
//
// Run with:
//   node docs-notes/qa-sweep-2026-09-04/surface-parity.mjs
//
// **Why this axis.** Design requirement #2 asks for a dashboard that configures
// policy, and this project's standing rule is that *a capability reachable only
// from code does not satisfy it* — a capability has to be reachable by the
// person the requirement names. Finding 140 found two Root settings that worked
// end to end with no control anywhere but the CLI. Findings 222–224 found the
// mirror image: a Root control with a route and a dashboard button and no
// command. 239 found a route that had accepted a parameter since M6 with no
// affordance anywhere to supply it.
//
// Four instances of one defect class, so it gets a mechanical check rather than
// another careful read.
//
// **What this does and does not prove.** It compares the *route names* each
// surface mentions. A route the dashboard calls with a query string, or a CLI
// command that reaches a store function directly rather than over HTTP, will
// look absent here and may not be. The method note from the earlier sweep
// applies and is repeated because it cost time then: **check the call site
// before believing a gap; four of six were false positives.** This narrows
// where to look; it does not decide.
import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..", "..");
const read = (file) => fs.readFileSync(path.join(repo, file), "utf8");
const listing = (dir, match) =>
  fs.readdirSync(path.join(repo, dir)).filter((name) => match.test(name));

// ── The HTTP surface: what the Gateway actually serves. ────────────────────
const routeFiles = listing("src/gateway", /^governance-.*\.ts$/).filter(
  (name) => !name.includes(".test."),
);
// **Method-aware, and the first version was not, which overstated coverage.**
// `users` is a GET that lists accounts and a POST that creates one. Mapping the
// route name to the new `accounts` command marked the whole row reachable while
// only the read half was, which is the same "a check that stands in for
// something it does not exercise" this project keeps recording. A route is a
// verb and a noun, so the unit here is the pair.
const served = new Map();
for (const file of routeFiles) {
  const text = read(path.join("src/gateway", file));
  for (const m of text.matchAll(/route === "([^"]+)"\s*&&\s*req\.method === "([A-Z]+)"/g)) {
    const key = `${m[2]} ${m[1]}`;
    if (!served.has(key)) {
      served.set(key, { file, route: m[1], method: m[2] });
    }
  }
  // Routes that do not branch on the method at the same site.
  for (const m of text.matchAll(/route === "([^"]+)"/g)) {
    const bare = `ANY ${m[1]}`;
    const alreadyPaired = [...served.keys()].some((key) => key.endsWith(` ${m[1]}`));
    if (!alreadyPaired && !served.has(bare)) {
      served.set(bare, { file, route: m[1], method: "ANY" });
    }
  }
}

// ── The dashboard: what the browser bundle asks for. ───────────────────────
const uiText = listing("ui/src/pages/governance", /^api.*\.ts$/)
  .map((name) => read(path.join("ui/src/pages/governance", name)))
  .join("\n");
const uiCalls = new Set();
for (const m of uiText.matchAll(/["'`]([a-z][a-z0-9-]*(?:\/[a-z0-9-]+)*)["'`]/gi)) {
  uiCalls.add(m[1]);
}

// ── The command line: every registered command path. ───────────────────────
const cliText = listing("src/cli/program", /^register\.governance.*\.ts$/)
  .map((name) => read(path.join("src/cli/program", name)))
  .join("\n");
// **Full command paths, not bare leaf names, and the first version was not.**
// `organisation delete` and `users/delete` both end in the word "delete", so
// matching on the leaf reported the account-deletion route as reachable from a
// command that deletes the whole organisation. A false green is worse than no
// check: it is the tool telling you to stop looking. Commander registers a
// subcommand on its parent's variable, so the variable name is the parent.
const cliCommands = new Set();
for (const m of cliText.matchAll(/(\w+)\s*\r?\n?\s*\.command\("([^"]+)"/g)) {
  const parent = m[1];
  const leaf = m[2].split(" ")[0];
  cliCommands.add(leaf);
  if (parent !== "governance" && parent !== "program") {
    cliCommands.add(`${parent} ${leaf}`);
  }
}

// A route name and a command name are not the same vocabulary, so the CLI
// column is matched on the route's last segment as well as the whole thing.
const reachableFromCli = (route, method) => {
  const tail = route.split("/").pop() ?? route;
  const words = new Set([route, tail, ...route.split("/")]);
  // A noun that means different things under different parents has to be asked
  // for by its full path. `delete` is the one that bit: `organisation delete`
  // removes everything, and there is no account-level delete on the CLI at all.
  // Only the nouns that genuinely mean different things under two parents.
  // `remove` was in this set and should not have been: the policy CLI spells it
  // `remove-rule`, which the hyphen-insensitive comparison below already finds,
  // and listing it here reported a working command as missing.
  const AMBIGUOUS = new Set(["delete", "list", "show"]);
  if (AMBIGUOUS.has(tail)) {
    const parent = route.split("/")[0];
    const qualified = [`${parent} ${tail}`, `${parent}s ${tail}`];
    const found = qualified.find((candidate) => cliCommands.has(candidate));
    return found;
  }
  // Hand-mapped where the two vocabularies differ. Each of these was checked
  // at the call site on 2026-09-04, which is what the note at the top of this
  // file insists on: `pending` serves `pending-decisions`, `requests` serves
  // `rule-requests`, and `accounts` serves `users`.
  // Keyed by "METHOD route", because `accounts` lists and does not create.
  const SYNONYMS = {
    "GET pending-decisions": "pending",
    "ANY pending-decisions": "pending",
    "GET rule-requests": "requests list",
    "ANY rule-requests": "requests list",
    "POST rule-requests": "requests submit",
    "GET users": "accounts",
  };
  const synonym = SYNONYMS[`${method} ${route}`];
  if (synonym && cliCommands.has(synonym)) {
    return synonym;
  }
  for (const command of cliCommands) {
    if (words.has(command)) {
      return command;
    }
    // `set-mode` for `policy/mode`, `set-agent-ask` for `policy/agent-ask`.
    if (command.startsWith("set-") && words.has(command.slice(4))) {
      return command;
    }
    if (command.replace(/-/g, "") === tail.replace(/-/g, "")) {
      return command;
    }
  }
  return undefined;
};

const rows = [...served.values()]
  .toSorted((a, b) => `${a.route} ${a.method}`.localeCompare(`${b.route} ${b.method}`))
  .map((entry) => ({
    label: `${entry.method === "ANY" ? "" : entry.method + " "}${entry.route}`,
    route: entry.route,
    module: entry.file.replace("governance-", "").replace(".ts", ""),
    dashboard: uiCalls.has(entry.route),
    cli: reachableFromCli(entry.route, entry.method),
  }));

const pad = (value, width) => String(value).padEnd(width);
console.log(`HTTP route/method pairs served: ${rows.length}\n`);
console.log(`${pad("ROUTE", 34)}${pad("DASH", 6)}${pad("CLI", 26)}MODULE`);
console.log("-".repeat(96));
for (const row of rows) {
  console.log(
    pad(row.label, 34) +
      pad(row.dashboard ? "yes" : "NO", 6) +
      pad(row.cli ?? "NO", 26) +
      row.module,
  );
}

const gaps = rows.filter((row) => !row.dashboard || !row.cli);
console.log(`\n${rows.length - gaps.length}/${rows.length} routes reachable from both surfaces`);
if (gaps.length > 0) {
  console.log("\nWorth checking by hand (this list contains false positives by design):");
  for (const row of gaps) {
    const missing = [!row.dashboard && "dashboard", !row.cli && "cli"].filter(Boolean);
    console.log(`  ${pad(row.label, 34)} missing from: ${missing.join(", ")}`);
  }
}
