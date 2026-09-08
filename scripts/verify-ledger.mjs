#!/usr/bin/env node
// Verify a governance audit ledger without asking the governance layer (T62).
//
//   node scripts/verify-ledger.mjs                    # every organisation
//   node scripts/verify-ledger.mjs --group <groupId>  # one of them
//   node scripts/verify-ledger.mjs --dir /path/to/governance
//
// Exit 0 = every chain checked is intact. 1 = at least one is not.
// 2 = the check could not be performed, which is not the same as a pass.
//
// ## Why this exists
//
// Design requirement 8 is a tamper-evident record. The dashboard reports the
// verification — since finding 268 it shows the chain head, the checkpoint that
// independently agrees with it, and how many entries were checked — but it is
// the *same process* that holds the ledger. Asking a system whether it has been
// tampered with, and believing its answer, is the shape of the problem rather
// than a solution to it.
//
// Until 2026-09-07 there was a second reader: `openclaw governance audit verify`
// ran in its own process. The governance command line was removed that day, and
// this replaces the one capability of it that was load-bearing for a design
// requirement. **It is not a command surface**: no registry entry, no `--help`
// presence, no tiers, no session, and no way to write anything.
//
// ## Three deliberate properties
//
// **It imports nothing from `src/`.** Plain Node, no build, no dependencies. It
// therefore still runs when the build is broken, the Gateway is down, or the
// governance layer refuses to start — which is exactly when somebody wants to
// know whether the record is intact. It will also run against a copy of the
// files taken off the machine, which is the only arrangement that survives an
// attacker who owns the host (§7 caveat 4).
//
// **It does not sign in, and cannot.** The removed command required a governance
// session before it would verify. That is the wrong way round for an audit tool:
// authenticating to a possibly-compromised installation before auditing it makes
// the audit depend on the thing under audit. This reads three files.
//
// **It re-implements the hashing rather than importing it.** Importing
// `verifyLedgerChain` would check the data with the same code that wrote it, so
// a defect in that code would agree with itself. The cost of re-implementing is
// that the two can drift apart, and a verifier that cries wolf is worse than
// none — so `src/governance/verify-ledger-script.test.ts` pins this against the
// production verifier on real chains, intact and tampered, and fails if they
// ever disagree. _(This line named `scripts/verify-ledger.test.ts`, a file that
// has never existed, until 2026-09-07: the independence claim above rests
// entirely on that test, and the only pointer to it was wrong.)_
import { createHash, createHmac } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const GENESIS_HASH = "0".repeat(64);
const KEY_BYTES = 32;
/**
 * Mirrors `MIN_SUPPLIED_KEY_LENGTH` in `src/governance/ledger-key.ts`.
 *
 * **Added after this file shipped, and the omission had teeth.** The product
 * refuses a supplied key shorter than this outright — `LedgerKeyUnusableError`,
 * a tool call blocked rather than recorded under a guessable key. This script
 * accepted any non-empty value, so `OPENCLAW_GOVERNANCE_LEDGER_KEY=x` made it
 * HMAC every entry under a one-byte key, disagree with all of them, and report
 * **`BROKEN at entry 1`, exit 1** — a misconfiguration announced as tampering,
 * which is precisely what this file's header says the third exit code exists to
 * prevent. Driven, not reasoned about. It is now an exit 2.
 */
const MIN_SUPPLIED_KEY_LENGTH = 16;

/**
 * The exact byte string each entry's hash covers.
 *
 * **Presence-based, and that is load-bearing rather than stylistic.** Fields
 * joined the entry over time, and each joins the payload only when present, so a
 * chain written before a field existed hashes the array it hashed then and still
 * verifies byte-identically. It also means adding or stripping one of those
 * fields changes the shape and breaks the hash, which is the detection this
 * relies on.
 *
 * `role:` and `intent:` are tagged so a value equal to the literal `"keyed"`
 * cannot be read as the marker that follows it.
 *
 * Any divergence from `canonicalPayload` in `src/governance/audit-ledger.ts` is
 * a defect in this file. The test pins them together.
 */
function canonicalPayload(e) {
  const base = [
    e.seq,
    e.timestamp,
    e.agentId,
    e.sessionKey,
    e.toolName,
    e.resourceKind,
    e.resource,
    e.ruleId,
    e.decision,
    e.prevHash,
  ];
  const withAdmin =
    e.entryKind === undefined && e.actor === undefined
      ? base
      : [...base, e.entryKind ?? "", e.actor ?? ""];
  const withRole = e.actorRole === undefined ? withAdmin : [...withAdmin, `role:${e.actorRole}`];
  const withIntent = e.intent === undefined ? withRole : [...withRole, `intent:${e.intent}`];
  return JSON.stringify(e.keyed ? [...withIntent, "keyed"] : withIntent);
}

/** HMAC when the entry is keyed, plain SHA-256 for entries predating the key. */
function hashEntry(entry, key) {
  const payload = canonicalPayload(entry);
  if (entry.keyed) {
    if (!key) {
      throw new Error("entry is keyed but no ledger key was found");
    }
    return createHmac("sha256", key).update(payload).digest("hex");
  }
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * The installation's signing key, from the environment or the key file.
 *
 * Validated the way the product validates it, on **both** paths: exactly 32
 * bytes of hexadecimal from the file, and at least `MIN_SUPPLIED_KEY_LENGTH`
 * characters from the environment. A key that decodes short would silently
 * produce a weaker HMAC and make every entry look wrong, so it is refused
 * rather than used.
 *
 * Raw text rather than hex for the environment key, matching `decodeSuppliedKey`
 * in `src/governance/ledger-key.ts`: an operator supplies a passphrase from a
 * secret manager without an encoding step. Reading it as hex here would produce
 * a different key from the one the product wrote with and fail every entry.
 */
async function loadKey(dir) {
  const supplied = process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY?.trim();
  if (supplied) {
    if (supplied.length < MIN_SUPPLIED_KEY_LENGTH) {
      throw new Error(
        `the key supplied through OPENCLAW_GOVERNANCE_LEDGER_KEY is ${supplied.length} ` +
          `character${supplied.length === 1 ? "" : "s"} long, and this installation requires ` +
          `at least ${MIN_SUPPLIED_KEY_LENGTH}. The product refuses to write under a key this ` +
          `short, so nothing was ever signed with it and no chain can verify against it`,
      );
    }
    return { key: Buffer.from(supplied, "utf8"), source: "OPENCLAW_GOVERNANCE_LEDGER_KEY" };
  }
  let text;
  try {
    text = (await readFile(join(dir, "ledger.key"), "utf8")).trim();
  } catch {
    return { key: undefined, source: "none (this installation has no key file)" };
  }
  if (!/^[0-9a-fA-F]+$/.test(text) || text.length % 2 !== 0) {
    throw new Error("ledger.key is not valid hexadecimal");
  }
  const key = Buffer.from(text, "hex");
  if (key.length !== KEY_BYTES) {
    throw new Error(`ledger.key decodes to ${key.length} bytes, not ${KEY_BYTES}`);
  }
  return { key, source: "ledger.key" };
}

async function readJsonOrUndefined(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * Every check the product makes, in the order it makes them.
 *
 * The order matters for the message an operator gets: a broken chain should be
 * reported as a broken chain rather than as a checkpoint mismatch downstream of
 * it.
 */
function verifyChain({ entries, key, installationIsKeyed, checkpoint }) {
  let expectedSeq = 1;
  let expectedPrevHash = GENESIS_HASH;
  let seenKeyed = false;
  let checked = 0;
  let lastEntry;

  for (const entry of entries) {
    if (entry.seq !== expectedSeq) {
      return {
        ok: false,
        checked,
        at: entry.seq,
        why: `unexpected sequence number (expected ${expectedSeq})`,
      };
    }
    if (entry.prevHash !== expectedPrevHash) {
      return {
        ok: false,
        checked,
        at: entry.seq,
        why: "prevHash does not match the preceding entry's hash",
      };
    }
    if (seenKeyed && !entry.keyed) {
      return {
        ok: false,
        checked,
        at: entry.seq,
        why: "unkeyed entry after a keyed one; the chain was downgraded",
      };
    }
    const { hash, ...withoutHash } = entry;
    if (hashEntry(withoutHash, key) !== hash) {
      return {
        ok: false,
        checked,
        at: entry.seq,
        why: "entry hash does not match its own recomputed content",
      };
    }
    seenKeyed ||= entry.keyed === true;
    expectedPrevHash = hash;
    expectedSeq += 1;
    checked += 1;
    lastEntry = entry;
  }

  // Rebuilding the whole file from genesis in the *unkeyed* format needs no
  // secret and switches nothing mid-file, so the chain above verifies happily.
  // What distinguishes "old" from "rewritten" is not in the file: once the
  // installation holds a key, every append is keyed, so the newest entry must be.
  if (installationIsKeyed && lastEntry && !lastEntry.keyed) {
    return {
      ok: false,
      checked,
      at: lastEntry.seq,
      why: "this installation has a ledger key, so every entry it wrote is keyed, but the newest is not: the chain was rewritten in the pre-key format, which requires no secret",
    };
  }

  // A prefix of a valid chain is still a valid chain, so nothing above notices
  // entries deleted from the end. Only the independent checkpoint does.
  if (installationIsKeyed && !checkpoint && checked > 0) {
    return {
      ok: false,
      checked,
      at: lastEntry?.seq ?? 0,
      why: "the checkpoint file is missing; without it, entries removed from the end cannot be detected",
    };
  }
  if (checkpoint) {
    const lastSeq = lastEntry?.seq ?? 0;
    if (checkpoint.seq > lastSeq) {
      const gone = checkpoint.seq - lastSeq;
      return {
        ok: false,
        checked,
        at: lastSeq,
        why: `ledger ends at entry ${lastSeq} but the checkpoint records entry ${checkpoint.seq}: ${gone} entr${gone === 1 ? "y was" : "ies were"} removed from the end`,
      };
    }
    if (checkpoint.seq === lastSeq && lastEntry && checkpoint.hash !== lastEntry.hash) {
      return {
        ok: false,
        checked,
        at: lastSeq,
        why: "the final entry does not match the checkpoint recorded when it was written",
      };
    }
  }
  return { ok: true, checked, head: lastEntry, checkpoint };
}

function parseArgs(argv) {
  const args = { dir: undefined, group: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dir") {
      args.dir = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--group") {
      args.group = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir =
    args.dir ?? process.env.OPENCLAW_GOVERNANCE_DIR ?? join(homedir(), ".openclaw", "governance");

  console.log(`governance directory: ${dir}`);

  let keyInfo;
  try {
    keyInfo = await loadKey(dir);
  } catch (err) {
    // **Exit 2, not 1.** "I could not check" and "I checked and it is broken"
    // are different answers, and collapsing them is how a verifier starts
    // reporting infrastructure problems as tampering.
    console.error(`cannot verify: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
  console.log(`signing key: ${keyInfo.source}`);

  const checkpoints = (await readJsonOrUndefined(join(dir, "ledger-checkpoint.json"))) ?? {};

  let groups;
  if (args.group) {
    groups = [args.group];
  } else {
    try {
      groups = await readdir(join(dir, "groups"));
    } catch {
      console.error(`cannot verify: no groups directory under ${dir}`);
      process.exit(2);
    }
  }
  if (groups.length === 0) {
    console.error("cannot verify: no organisations found");
    process.exit(2);
  }

  let anyBroken = false;
  let anyChecked = false;

  for (const group of groups) {
    const ledgerPath = join(dir, "groups", group, "audit-ledger.jsonl");
    let raw;
    try {
      raw = await readFile(ledgerPath, "utf8");
    } catch {
      console.log(`\n${group}: no ledger file`);
      continue;
    }
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);
    const entries = [];
    let malformed;
    for (const [index, line] of lines.entries()) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        malformed = index + 1;
        break;
      }
    }
    if (malformed !== undefined) {
      console.log(`\n${group}: BROKEN — line ${malformed} is not valid JSON`);
      anyBroken = true;
      continue;
    }

    const result = verifyChain({
      entries,
      key: keyInfo.key,
      installationIsKeyed: keyInfo.key !== undefined,
      checkpoint: checkpoints[group],
    });
    anyChecked = true;

    console.log(`\n${group}:`);
    if (!result.ok) {
      anyBroken = true;
      console.log(`  BROKEN at entry ${result.at}: ${result.why}`);
      console.log(`  entries verified before the break: ${result.checked}`);
      continue;
    }
    console.log(`  INTACT — ${result.checked} entr${result.checked === 1 ? "y" : "ies"} verified`);
    if (result.head) {
      console.log(`  chain head: #${result.head.seq}  ${result.head.hash}`);
      console.log(`  keyed: ${result.head.keyed === true}`);
    }
    if (result.checkpoint) {
      // **"Ahead" is the one thing it cannot be here, and this line said it.**
      // `verifyChain` returns BROKEN when `checkpoint.seq > lastSeq`, so any
      // disagreement surviving to this point is the checkpoint sitting
      // *behind* the ledger — and that state is legitimate and reachable:
      // `appendLedgerEntry` writes the entry first and the checkpoint second,
      // on purpose, so a crash between the two leaves exactly this. Printed as
      // "AHEAD of the ledger" it reads as entries removed from the end, which
      // is the one conclusion an operator must not draw from an INTACT chain.
      // Driven rather than reasoned about: a three-entry chain with the
      // checkpoint left at #2 printed "INTACT" and "#2 AHEAD of the ledger" in
      // consecutive lines.
      const headSeq = result.head?.seq ?? 0;
      const behind = headSeq - result.checkpoint.seq;
      console.log(
        `  checkpoint: #${result.checkpoint.seq} ${
          behind === 0
            ? "agrees"
            : `is ${behind} entr${behind === 1 ? "y" : "ies"} behind the ledger head ` +
              `(the newest were appended after the last checkpoint write; the chain itself verifies)`
        }`,
      );
    } else {
      console.log("  checkpoint: none recorded");
    }
  }

  if (!anyChecked && !anyBroken) {
    console.error("\ncannot verify: no ledgers were found to check");
    process.exit(2);
  }
  console.log(anyBroken ? "\nAt least one chain is BROKEN." : "\nEvery chain checked is intact.");
  process.exit(anyBroken ? 1 : 0);
}

await main();
