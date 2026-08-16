// Password hashing for governance dashboard accounts, using Node's built-in
// scrypt (no new dependency — the design doc's economic/manufacturability
// constraints favor open-source, low-cost, low-dependency components).
//
// **Why the stored format carries its own parameters (QA finding B9).** The
// original format was `scrypt:salt:hash`, which records *that* scrypt was used
// and nothing about how hard it was told to work. Every verification therefore
// had to assume the parameters in force today. That made the cost permanently
// unraisable: increasing it would re-derive every existing password with
// settings they were never hashed under, every comparison would fail, and —
// with no reset path — the installation would be locked out irrecoverably. A
// security parameter you can never increase is one you chose once, forever, at
// the moment you understood the least.
//
// Recording the parameters alongside the hash is the standard resolution: each
// stored password is verified under the settings it was actually created with,
// so the default can move whenever hardware does. `needsRehash` then reports
// which stored passwords are behind, and the login path upgrades them in place
// the next time their owner signs in — no reset, no coordination, no window
// where anybody is locked out.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

type ScryptParams = { N: number; r: number; p: number };

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptParams & { maxmem: number },
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SCHEME = "scrypt";

/**
 * Cost in force for newly hashed passwords.
 *
 * Raise these as hardware improves. Existing passwords keep verifying under
 * whatever they were created with, and upgrade on next sign-in — which is the
 * whole point of recording the parameters.
 */
export const CURRENT_SCRYPT_PARAMS: ScryptParams = { N: 16_384, r: 8, p: 1 };

/**
 * Parameters assumed for a stored hash that predates parameter recording.
 *
 * These are Node's `scrypt` defaults, which is what the old three-part format
 * was implicitly using. Naming them here is what lets those passwords keep
 * working after the default moves.
 */
const LEGACY_SCRYPT_PARAMS: ScryptParams = { N: 16_384, r: 8, p: 1 };

/**
 * scrypt needs roughly 128 × N × r bytes and refuses to run past `maxmem`,
 * whose default is 32 MB. Deriving the bound from the parameters means raising
 * N does not fail with an opaque memory error instead of simply costing more.
 */
function maxmemFor(params: ScryptParams): number {
  return Math.max(32 * 1024 * 1024, 256 * params.N * params.r);
}

function encodeParams(params: ScryptParams): string {
  return `N=${params.N},r=${params.r},p=${params.p}`;
}

function decodeParams(encoded: string): ScryptParams | undefined {
  const parsed: Partial<ScryptParams> = {};
  for (const pair of encoded.split(",")) {
    const [key, rawValue] = pair.split("=");
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value <= 0) {
      return undefined;
    }
    if (key === "N" || key === "r" || key === "p") {
      parsed[key] = value;
    }
  }
  return parsed.N && parsed.r && parsed.p ? { N: parsed.N, r: parsed.r, p: parsed.p } : undefined;
}

export async function hashPassword(
  password: string,
  params: ScryptParams = CURRENT_SCRYPT_PARAMS,
): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH, {
    ...params,
    maxmem: maxmemFor(params),
  });
  // Four parts, so the three-part legacy form stays unambiguously
  // distinguishable rather than being guessed at.
  return `${SCHEME}:${encodeParams(params)}:${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** Splits a stored hash into the pieces needed to re-derive it. */
function parseStored(
  stored: string,
): { params: ScryptParams; saltHex: string; hashHex: string } | undefined {
  const parts = stored.split(":");
  if (parts[0] !== SCHEME) {
    return undefined;
  }
  if (parts.length === 3) {
    const [, saltHex, hashHex] = parts;
    return saltHex && hashHex ? { params: LEGACY_SCRYPT_PARAMS, saltHex, hashHex } : undefined;
  }
  if (parts.length === 4) {
    const [, encoded, saltHex, hashHex] = parts;
    const params = encoded ? decodeParams(encoded) : undefined;
    return params && saltHex && hashHex ? { params, saltHex, hashHex } : undefined;
  }
  return undefined;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parseStored(stored);
  if (!parsed) {
    return false;
  }
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parsed.saltHex, "hex");
    expected = Buffer.from(parsed.hashHex, "hex");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }
  const derived = await scrypt(password, salt, expected.length, {
    ...parsed.params,
    maxmem: maxmemFor(parsed.params),
  });
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/**
 * True when this stored password was hashed more weakly than the current
 * setting, so it should be re-hashed the next time the plaintext is available —
 * which is exactly once, during a successful sign-in.
 *
 * Compares every parameter rather than just `N`: lowering `r` while raising `N`
 * can reduce total work, and an upgrade check that only watched one number
 * would call that an improvement.
 */
export function needsRehash(stored: string): boolean {
  const parsed = parseStored(stored);
  if (!parsed) {
    // Unparseable, so it cannot be verified either. Reporting it as needing a
    // rehash is harmless and means a corrupted record gets repaired the moment
    // somebody proves they own the account.
    return true;
  }
  return (
    parsed.params.N < CURRENT_SCRYPT_PARAMS.N ||
    parsed.params.r < CURRENT_SCRYPT_PARAMS.r ||
    parsed.params.p < CURRENT_SCRYPT_PARAMS.p ||
    // The legacy three-part form records nothing, so it is upgraded on sight
    // even when its assumed parameters match today's.
    stored.split(":").length === 3
  );
}
