// The secret that turns the audit chain from a checksum into a signature.
//
// **The gap this closes (QA finding B3).** Chaining SHA-256 hashes proves that
// no *interior* entry was altered, but only against someone who cannot redo the
// arithmetic. The algorithm is public and took no secret, so an attacker with
// write access to the ledger could edit an entry, recompute every hash from
// there to the end, and hand back a file that verified perfectly. The chain
// detected accidental corruption and casual editing; it did not detect a
// patient adversary, which is the one the requirement is about.
//
// Keying the chain with HMAC-SHA256 means recomputing the forward hashes
// requires the key. Editing history without it breaks the chain exactly as
// intended.
//
// **What this does not claim.** The key lives on the same host as the ledger, so
// an attacker who can read *both* can still forge. That is a real limitation and
// is stated plainly rather than glossed: what changes is that reading the ledger
// is no longer sufficient, and the key can be given tighter permissions, held by
// a different OS user, or supplied from outside the machine through
// OPENCLAW_GOVERNANCE_LEDGER_KEY. Genuinely closing it needs an off-host
// verifier, which is deployment rather than code and is recorded as future work.
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { governanceHomeDir, ledgerKeyFilePath } from "./paths.js";

/** 256 bits, matching the HMAC's output size. */
const KEY_BYTES = 32;

let cachedKey: Buffer | undefined;

/**
 * Loads the installation's ledger key, creating it on first use.
 *
 * Created rather than required, because a governance layer that refuses to
 * start until somebody provisions a secret would be switched off, and an
 * unkeyed chain is what we are moving away from. First run generates one; every
 * run after reuses it.
 *
 * `OPENCLAW_GOVERNANCE_LEDGER_KEY` overrides the file. That exists so a
 * deployment can hold the key somewhere the ledger writer cannot read it back
 * from disk — an environment secret, a mounted file, a different user's
 * keyring — which is what makes the separation meaningful rather than notional.
 */
export async function loadLedgerKey(): Promise<Buffer> {
  if (cachedKey) {
    return cachedKey;
  }
  const override = process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY?.trim();
  if (override) {
    // Accepted as raw text rather than requiring hex, so an operator can supply
    // a passphrase from a secret manager without an encoding step. HMAC accepts
    // a key of any length.
    cachedKey = Buffer.from(override, "utf8");
    return cachedKey;
  }
  await mkdir(governanceHomeDir(), { recursive: true, mode: 0o700 });
  const path = ledgerKeyFilePath();
  try {
    const existing = (await readFile(path, "utf8")).trim();
    if (existing) {
      cachedKey = Buffer.from(existing, "hex");
      if (cachedKey.length > 0) {
        return cachedKey;
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
  const generated = randomBytes(KEY_BYTES);
  // `wx` so two processes racing on first run cannot both write a key — the
  // loser re-reads the winner's. Two different keys would split the chain into
  // two mutually unverifiable halves.
  try {
    await writeFile(path, generated.toString("hex"), { encoding: "utf8", flag: "wx", mode: 0o600 });
    cachedKey = generated;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
    cachedKey = Buffer.from((await readFile(path, "utf8")).trim(), "hex");
  }
  // Reassert the mode: an inherited umask or a file restored from a backup can
  // leave it readable, and a world-readable key is the same as no key.
  await chmod(path, 0o600).catch(() => {});
  return cachedKey;
}

/** Test-only: forgets the cached key so a suite can simulate a fresh process. */
export function resetLedgerKeyCacheForTests(): void {
  cachedKey = undefined;
}
