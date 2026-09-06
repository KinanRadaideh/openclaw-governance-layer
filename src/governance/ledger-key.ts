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

/**
 * How many times a caller re-reads a key another writer is still writing.
 *
 * Twenty attempts at 25ms is half a second, which is orders of magnitude longer
 * than the write it is waiting on and short enough that a genuinely broken key
 * is reported promptly rather than hung on.
 */
const KEY_READ_ATTEMPTS = 20;
const KEY_READ_RETRY_MS = 25;

/**
 * Shortest key this installation will accept from
 * `OPENCLAW_GOVERNANCE_LEDGER_KEY`.
 *
 * **The override validated nothing until 2026-09-01**, so
 * `OPENCLAW_GOVERNANCE_LEDGER_KEY=x` produced a one-byte HMAC key and the
 * chain's entire claim, *recomputing the forward hashes requires the key*,
 * became a claim about guessing one character. Entries were still written
 * `keyed: true`, which is finding 78's outcome reached by a different road: the
 * file path was hardened against exactly this and the environment path was not.
 *
 * **The asymmetry is what makes it worth refusing rather than warning.** The
 * file is the default and is validated to exactly 32 bytes; the override is the
 * path this module's own header recommends for hardening, and it is the one an
 * operator takes *because they are being careful*. A floor under the careful
 * path is the minimum this module can offer without contradicting itself.
 *
 * Sixteen characters rather than thirty-two, deliberately. The generated key is
 * 32 random bytes and nothing supplied by hand will match that, so the number
 * has to be a floor under *brute force* rather than a demand for parity: 16
 * characters of anything unpredictable is far out of reach, and asking for 32
 * would push operators toward a shorter value in a config file instead of a
 * longer one in a secret manager. The existing deployments this must not break
 *the passphrase-from-a-vault shape, clear it comfortably.
 */
export const MIN_SUPPLIED_KEY_LENGTH = 16;

/**
 * Validates a key handed in through the environment.
 *
 * Shared by both entry points on purpose. `loadLedgerKey` writes and
 * `readLedgerKeyIfPresent` verifies, and a key too weak to write with is too
 * weak to verify against: the two must never disagree about whether this
 * installation is keyed.
 */
function decodeSuppliedKey(override: string): Buffer {
  if (override.length < MIN_SUPPLIED_KEY_LENGTH) {
    throw new LedgerKeyUnusableError(
      `the key supplied through OPENCLAW_GOVERNANCE_LEDGER_KEY is ${override.length} ` +
        `character${override.length === 1 ? "" : "s"} long, and at least ` +
        `${MIN_SUPPLIED_KEY_LENGTH} are required. A short key can be guessed, and a chain ` +
        `whose key can be guessed can be rewritten by anyone who can read it, which is the ` +
        `property this key exists to provide`,
    );
  }
  // Raw text rather than hex, so an operator can supply a passphrase from a
  // secret manager without an encoding step. HMAC accepts a key of any length;
  // the floor above is about guessability, not about the algorithm.
  return Buffer.from(override, "utf8");
}

let cachedKey: Buffer | undefined;

/**
 * Raised when the key file exists but does not contain a usable key.
 *
 * A distinct type because the correct response is distinct: a *missing* key is
 * a first run and one is generated, while a *damaged* key is either corruption
 * or an attack and must stop the process using it. Callers that append to the
 * ledger let this propagate: `runBeforeToolCallHook` turns a throw into a
 * blocked tool call, which is the right outcome: if the action cannot be
 * recorded trustworthily, it does not happen.
 */
export class LedgerKeyUnusableError extends Error {
  constructor(reason: string) {
    super(
      `The governance ledger key at ${ledgerKeyFilePath()} is unusable: ${reason}. ` +
        `Refusing to continue with a weakened key. An unreadable key silently ` +
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
 * `Buffer.from` does not reject non-hexadecimal input, it decodes the valid
 * prefix and silently discards the rest, so a key file filled with rubbish
 * produced a **zero-length** buffer, and a partially valid one produced a
 * single byte. Node's HMAC accepts both. The `length > 0` guard then sent the
 * caller down the "generate a new key" path, where the `wx` write failed with
 * `EEXIST` (the damaged file is still there), and the recovery branch re-read
 * the same damaged file *without* re-checking the length.
 *
 * The result was an installation whose ledger entries were still marked
 * `keyed: true` but were HMACed under the empty string, which is public. The
 * attack is to *damage* the key file rather than to read it. A materially
 * lower bar than the threat model assumed.
 *
 * Validated explicitly, in the order the failures actually occur: the text must
 * be hexadecimal, of even length, and decode to the full key size.
 */
/**
 * Reads a key another writer has just created, waiting for it to be written.
 *
 * The window is one filesystem write wide and is normally over before the first
 * read, so this almost always succeeds immediately. The retries exist for the
 * case that is otherwise unrecoverable: a caller that reads too early gets a
 * permanent-looking "the key is unusable" for a key that is perfectly fine a
 * millisecond later.
 *
 * Bounded rather than open-ended. A file that is still empty after this many
 * attempts is not a race, it is a genuinely broken key, and saying so is more
 * use than waiting for it.
 */
async function readKeyOnceWritten(path: string, firstRead?: string): Promise<Buffer> {
  let text = firstRead ?? (await readFile(path, "utf8")).trim();
  for (let attempt = 0; attempt < KEY_READ_ATTEMPTS; attempt += 1) {
    if (text.length > 0) {
      try {
        return decodeStoredKey(text);
      } catch {
        // Partial content is indistinguishable from corrupt content by
        // inspection — half a hex key is still hex — so the only way to tell
        // them apart is to look again and see whether it settles.
      }
    }
    await new Promise((resolve) => {
      setTimeout(resolve, KEY_READ_RETRY_MS);
    });
    text = (await readFile(path, "utf8")).trim();
  }
  if (text.length === 0) {
    throw new LedgerKeyUnusableError("it is empty");
  }
  // Still unusable after waiting: this is a broken key rather than a young one,
  // and `decodeStoredKey` says which way it is broken.
  return decodeStoredKey(text);
}

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
 * from disk, an environment secret, a mounted file, a different user's
 * keyring, which is what makes the separation meaningful rather than notional.
 */
export async function loadLedgerKey(): Promise<Buffer> {
  if (cachedKey) {
    return cachedKey;
  }
  const override = process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY?.trim();
  if (override) {
    cachedKey = decodeSuppliedKey(override);
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
    // **An unusable file is looked at again before it is refused** (finding
    // 277). This block used to hand an empty file straight to
    // `decodeStoredKey`, on the stated grounds that "the only way to produce
    // one is a crash between creating and writing". That is the assumption the
    // finding disproved: a **concurrent writer** produces exactly that state,
    // transiently and with no crash, because the `wx` write below creates the
    // file before it fills it. Two callers arriving together, which is ordinary
    // on a busy installation and guaranteed on a fresh one, and the second sees
    // a key that is empty for as long as one write takes.
    //
    // Waiting costs half a second on a key that really is broken, which is
    // nothing against reporting a working installation as corrupt. What it must
    // not do is generate a replacement: a second key cannot verify anything
    // written under the first.
    if (existing !== undefined) {
      cachedKey = await readKeyOnceWritten(path, existing);
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
  // `wx` so two writers racing on first run cannot both mint a key. The loser
  // re-reads the winner's. Two different keys would split the chain into two
  // mutually unverifiable halves.
  try {
    await writeFile(path, generated.toString("hex"), { encoding: "utf8", flag: "wx", mode: 0o600 });
    cachedKey = generated;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
    // **The loser waits for the content, and used to read once.** `wx` makes
    // the file *exist* before it holds anything, so `EEXIST` says only that
    // somebody got there first — not that they have finished writing. Reading
    // immediately could return an empty or half-written file, which
    // `decodeStoredKey` correctly refuses as "not hexadecimal", and that
    // refusal propagates as a failed ledger write, which the gate turns into a
    // blocked tool call. An agent stops working, and the message says the key
    // is corrupt when it is merely young.
    //
    // Found by the capacity test that floods one account with concurrent
    // prompts: they all miss the cache, one wins the `wx`, and the rest read a
    // key that is not there yet.
    //
    // **It fails closed and never weakened**: `decodeStoredKey` checks the
    // decoded length, so a truncated read is refused rather than accepted as a
    // shorter key. This is availability, not tamper-evidence.
    cachedKey = await readKeyOnceWritten(path);
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
 *      side effect: a read-only operation with a write in it.
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
    cachedKey = decodeSuppliedKey(override);
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
