// Captures what the dashboard's read routes actually answer, per tier, from a
// running gateway — so the browser render below is fed the server's real words
// rather than a hand-written fixture.
//
// A fixture is part of the check (finding 251). The two layout findings this
// project has lost most time to were both a fixture omitting the thing the
// defect lived in, so this file exists to stop guessing what the server sends.
//
// ## Running it
//
//   GOV_QA_ACCOUNTS='root:kinan:pw,administrator:haitham:pw,…' \
//     node docs-notes/qa-sweep-2026-09-08/capture-tier-snapshots.mjs <out.json>
//
// **The accounts come from the environment and this file holds no passwords.**
// The first draft had all five written into the array below, for a throwaway
// organisation that no longer exists — harmless in itself, and still the wrong
// thing to commit: a secret scanner cannot tell a fixture credential from a
// real one, and a repository whose subject is governance should not be teaching
// the habit. Findings 147 and 174 are this project's own history on credentials
// reaching places they should not.
import { writeFileSync } from "node:fs";

const BASE = process.env.GOV_BASE ?? "http://127.0.0.1:18801/control-ui/governance";

/**
 * `tier:username:password` triples, comma-separated, from `GOV_QA_ACCOUNTS`.
 *
 * Fails loudly rather than defaulting: a silent fallback to some assumed set of
 * names would produce a snapshot of the wrong installation, and the whole point
 * of this script is that its output can be trusted as what the server said.
 */
const ACCOUNTS = (process.env.GOV_QA_ACCOUNTS ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    // Split on the first two colons only, so a password may contain one.
    const firstColon = entry.indexOf(":");
    const secondColon = entry.indexOf(":", firstColon + 1);
    if (firstColon < 1 || secondColon < firstColon + 2) {
      throw new Error(`GOV_QA_ACCOUNTS entry must be tier:username:password, got "${entry}"`);
    }
    return {
      name: entry.slice(0, firstColon),
      username: entry.slice(firstColon + 1, secondColon),
      password: entry.slice(secondColon + 1),
    };
  });

if (ACCOUNTS.length === 0) {
  throw new Error(
    "Set GOV_QA_ACCOUNTS to tier:username:password triples, comma-separated. " +
      "Example: GOV_QA_ACCOUNTS='root:kinan:…,administrator:haitham:…,viewer:noor:…'",
  );
}

/** Every GET the page's refresh batch makes, by the field it lands in. */
const READS = [
  ["identity", "whoami"],
  ["policy", "policy"],
  ["ledger", "ledger?limit=50"],
  ["ruleRequests", "rule-requests"],
  ["systemStatus", "system"],
  ["deployment", "deployment"],
  ["activeSessions", "sessions"],
  ["pendingDecisions", "pending-decisions"],
  ["users", "users"],
  ["agents", "agents"],
  ["codexBackend", "backend/codex"],
];

async function login(username, password) {
  const res = await fetch(`${BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const cookie = res.headers.get("set-cookie");
  if (!cookie) {
    throw new Error(`login failed for ${username}: ${res.status} ${await res.text()}`);
  }
  return cookie.split(";")[0];
}

async function read(cookie, path) {
  const res = await fetch(`${BASE}/${path}`, { headers: { cookie } });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

const out = {};
for (const account of ACCOUNTS) {
  const cookie = await login(account.username, account.password);
  const snapshot = {};
  for (const [field, path] of READS) {
    snapshot[field] = await read(cookie, path);
  }
  out[account.name] = snapshot;
  const refused = Object.entries(snapshot)
    .filter(([, r]) => r.status !== 200)
    .map(([field, r]) => `${field}=${r.status}`);
  console.log(`${account.name.padEnd(16)} refused: ${refused.join(" ") || "(none)"}`);
}

const target = process.argv[2] ?? "tier-snapshots.json";
writeFileSync(target, JSON.stringify(out, null, 2));
console.log(`\nwrote ${target}`);
