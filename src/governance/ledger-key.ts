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
 * Raised when the key file exists but does not contain a usable key.
 *
 * A distinct type because the correct response is distinct: a *missing* key is
 * a first run and one is generated, while a *damaged* key is either corruption
 * or an attack and must stop the process using it. Callers that append to the
 * ledger let this propagate — `runBeforeToolCallHook` turns a throw into a
 * blocked tool call, which is the right outcome: if the action cannot be
 * recorded trustworthily, it does not happen.
 */
export class LedgerKeyUnusableError extends Error {
  constructor(reason: string) {
    super(
      `The governance ledger key at ${ledgerKeyFilePath()} is unusable: ${reason}. ` +
        `Refusing to continue with a weakened key — an unreadable key silently ` +
        `degrades the audit chain to an unkeyed one, which anyone can forge. ` +
        `Restore the key from backup, or supply it through ` +
        `OPENCLAW_GOVERNANCE_LEDGER_KEY. Note that a different key cannot verify ` +
        `entries written under the old one.`,
    );
    this.name = "LedgerKeyUnusableError";
  }
}

/**
 * Decodes the stored key, or explains why it cannot be used.
 *
 * **The defect this closes (QA round 13, finding 78).** The previous form was
 * `Buffer.from(existing, "hex")` followed by a `length > 0` check.
 * `Buffer.from` does not reject non-hexadecimal input — it decodes the valid
 * prefix and silently discards the rest — so a key file filled with rubbish
 * produced a **zero-length** buffer, and a partially valid one produced a
 * single byte. Node's HMAC accepts both. The `length > 0` guard then sent the
 * caller down the "generate a new key" path, where the `wx` write failed with
 * `EEXIST` (the damaged file is still there), and the recovery branch re-read
 * the same damaged file *without* re-checking the length.
 *
 * The result was an installation whose ledger entries were still marked
 * `keyed: true` but were HMACed under the empty string, which is public. The
 * attack is to *damage* the key file rather than to read it — a materially
 * lower bar than the threat model assumed.
 *
 * Validated explicitly, in the order the failures actually occur: the text must
 * be hexadecimal, of even length, and decode to the full key size.
 */
function decodeStoredKey(text: string): Buffer {
  if (!/^[0-9a-fA-F]+$/.test(text)) {
    throw new LedgerKeyUnusableError("it contains characters that are not hexadecimal");
  }
  if (text.length % 2 !== 0) {
    throw new LedgerKeyUnusableError("it has an odd number of hexadecimal digits");
  }
  const decoded = Buffer.from(text, "hex");
  if (decoded.length !== KEY_BYTES) {
    throw new LedgerKeyUnusableError(
      `it decodes to ${decoded.length} byte${decoded.length === 1 ? "" : "s"}, not ${KEY_BYTES}`,
    );
  }
  return decoded;
}

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
    // Throws rather than falling through to key generation. Falling through was
    // the defect: the `wx` write below fails with EEXIST against the file that
    // is already there, and the recovery branch then re-read it unchecked.
    //
    // An empty file reaches `decodeStoredKey` and is refused too. It is not a
    // normal state — the only way to produce one is a crash between creating
    // and writing — and refusing it says so, where generating a replacement
    // would quietly mint a key that cannot verify anything already written.
    if (existing !== undefined) {
      cachedKey = decodeStoredKey(existing);
      return cachedKey;
    }
  } catch (err) {
    if (err instanceof LedgerKeyUnusableError) {
      throw err;
    }
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
    // The loser of the race, or an empty file that another process has since
    // filled. Validated on the same terms as the ordinary read above.
    cachedKey = decodeStoredKey((await readFile(path, "utf8")).trim());
  }
  // Reassert the mode: an inherited umask or a file restored from a backup can
  // leave it readable, and a world-readable key is the same as no key.
  await chmod(path, 0o600).catch(() => {});
  return cachedKey;
}

/**
 * Reads the installation's key **without creating one**, for verification.
 *
 * Two separate reasons this is not `loadLedgerKey` (QA round 13, findings 76
 * and 77):
 *
 *   1. **Verification must not mint secrets.** `verifyLedgerChain` used
 *      `loadLedgerKey`, so checking a legacy unkeyed ledger created a key as a
 *      side effect — a read-only operation with a write in it.
 *   2. **The key's existence is the anchor.** Whether this installation has
 *      *ever* been keyed is what tells the verifier that an unkeyed chain, or a
 *      missing checkpoint, is wrong rather than merely old. That question has
 *      to be answerable without changing the answer by asking it.
 */
export async function readLedgerKeyIfPresent(): Promise<Buffer | undefined> {
  if (cachedKey) {
    return cachedKey;
  }
  const override = process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY?.trim();
  if (override) {
    cachedKey = Buffer.from(override, "utf8");
    return cachedKey;
  }
  let text: string;
  try {
    text = (await readFile(ledgerKeyFilePath(), "utf8")).trim();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw err;
  }
  cachedKey = decodeStoredKey(text);
  return cachedKey;
}

/** Test-only: forgets the cached key so a suite can simulate a fresh process. */
export function resetLedgerKeyCacheForTests(): void {
  cachedKey = undefined;
}
