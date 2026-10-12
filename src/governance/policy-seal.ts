// The policy file's seal: how governance notices that `policy.json` was changed by
// something other than its own store (T86 D9, option A).
//
// **The gap.** An Administrator who allows an agent to run an interpreter (`python`,
// `node`) lets it do anything the Gateway's operating-system account can, including
// rewriting the rules that bind it. `loadPolicy` already keeps the gate sound against a
// hand-edited file (the core rules are reasserted, bad fields coerced), but it used the
// edit and recorded nothing, so an agent could grant itself permissions in silence.
//
// **What this does: detect, never prevent** (Kinan's option A). Every write by the store
// carries a seal, an HMAC under the ledger key with its own label, over the document and
// a write counter. A load that finds a seal that does not match, no seal, an older
// counter than this process has already seen, or no file where there was one records a
// sealed integrity alert in the ledger, which the dashboard raises for Administrators and
// Root (T73's banner) until Root acknowledges it. The file as found is still used, and is
// then sealed as found, so one change raises one alert.
//
// **Why a seal in the file** (decision E15, mg/WORK-LOG-2026-10-12.md). A sidecar file
// would be findings 209/210's fact kept in two places; one atomic write keeps the seal and
// the document together. The chain itself would put an entry in the record for every stop
// and prune. The seal needs the key, as every ledger entry's does.
//
// **What it does not do**, stated as limits: an agent that reads the ledger key can make a
// valid seal (the limit `ledger-key.ts` states; supply the key through the environment to
// narrow it, run tools under a separate account to close it); an earlier copy put back, or
// the file deleted, *and* the Gateway restarted in the same step, is not noticed, because
// the counter this process has seen is held in memory.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readJsonIfExists } from "../infra/json-files.js";
import { appendIntegrityAlert, POLICY_FILE_ALERT_ACTION } from "./audit-ledger.js";
import { LedgerKeyUnusableError, readLedgerKeyIfPresent } from "./ledger-key.js";
import { policyFilePath } from "./paths.js";
import { writeGovernanceJson } from "./state-file.js";

/** The seal as stored, the last field of `policy.json`. */
type PolicySeal = { generation: number; mac: string };

/** What a load found that the store did not write. */
export type PolicyFileFinding = {
  kind: "edited" | "unsealed" | "earlier-copy" | "removed";
  /** The first 16 hex digits of the SHA-256 of the file as found; `-` when there is none. */
  fingerprint: string;
  /** For `earlier-copy`: the counter found, and the highest this process had seen. */
  found?: number;
  seen?: number;
};

/** The label keeps this HMAC from ever equalling one the ledger or the witness computes. */
const SEAL_LABEL = "openclaw-governance-policy-seal\n";

/** The highest write counter seen per policy file, by this process. */
const highestSeen = new Map<string, number>();

/** Findings already recorded by this process, per policy file (T73's `reportedFindings`). */
const reported = new Map<string, Set<string>>();

/**
 * The fingerprint of a file this process wrote without a seal, because there was no usable
 * key to seal it with. Its own file is not news; the same file after a restart is.
 */
const writtenUnsealed = new Map<string, string>();

/** Test-only: forget what this process has seen, as a restart would. */
export function resetPolicySealStateForTests(): void {
  highestSeen.clear();
  reported.clear();
  writtenUnsealed.clear();
}

/**
 * The key, or `undefined` when there is none or it is unusable.
 *
 * **Never created here** (findings 76 and 77). The key's existence is what tells the
 * ledger's verifier that this installation is keyed, so a policy write that minted one
 * beside a legacy unkeyed chain made that chain read as downgraded; creating it is the
 * ledger writer's job. **An unusable key does not stop a policy write** either: the kill
 * switch writes this file, and a stop must land whatever state the key is in. The key's
 * own failure is reported where the ledger uses it (and as its own deployment row).
 */
async function usableKey(): Promise<Buffer | undefined> {
  try {
    return await readLedgerKeyIfPresent();
  } catch (err) {
    if (err instanceof LedgerKeyUnusableError) {
      return undefined;
    }
    throw err;
  }
}

/**
 * The seal names the organisation as well, so a sealed file copied in from another
 * organisation's folder (one key serves the installation) does not pass as this one's.
 */
function macFor(key: Buffer, groupId: string, generation: number, body: unknown): string {
  return createHmac("sha256", key)
    .update(SEAL_LABEL)
    .update(`${groupId}\n`)
    .update(`${generation}\n`)
    .update(JSON.stringify(body))
    .digest("hex");
}

function isSeal(value: unknown): value is PolicySeal {
  const seal = value as PolicySeal | undefined;
  return (
    typeof seal === "object" &&
    seal !== null &&
    Number.isSafeInteger(seal.generation) &&
    seal.generation > 0 &&
    typeof seal.mac === "string"
  );
}

function sealMatches(key: Buffer, groupId: string, seal: PolicySeal, body: unknown): boolean {
  const expected = Buffer.from(macFor(key, groupId, seal.generation, body), "utf8");
  const found = Buffer.from(seal.mac, "utf8");
  return expected.length === found.length && timingSafeEqual(expected, found);
}

function fingerprintOf(stored: unknown): string {
  return createHash("sha256").update(JSON.stringify(stored)).digest("hex").slice(0, 16);
}

function raiseSeen(path: string, generation: number): void {
  highestSeen.set(path, Math.max(highestSeen.get(path) ?? 0, generation));
}

/** Splits a stored document into its body and its seal, when it is an object at all. */
function split(stored: unknown): { body: unknown; seal: unknown } {
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) {
    return { body: stored, seal: undefined };
  }
  const { seal, ...body } = stored as Record<string, unknown>;
  return { body, seal };
}

/**
 * Reads `policy.json` and checks its seal. Returns the stored document without its seal
 * (`null` when there is no file), and what was found when the store did not write it.
 *
 * With no ledger key nothing is checked (decision E20): a key cannot be minted by reading.
 */
export async function readSealedPolicyFile(
  groupId: string,
): Promise<{ stored: unknown; finding?: PolicyFileFinding }> {
  const path = policyFilePath(groupId);
  // Taken before the read: a write that finishes while this read is under way raises the
  // counter after its rename, so comparing with the value from before cannot mistake the
  // file this read saw for an earlier copy.
  const seenBefore = highestSeen.get(path) ?? 0;
  const stored = await readJsonIfExists<unknown>(path);
  const { body, seal } = split(stored);
  const key = await usableKey();
  if (!key) {
    return { stored: body };
  }
  if (stored === null) {
    return seenBefore > 0
      ? { stored: null, finding: { kind: "removed", fingerprint: "-", seen: seenBefore } }
      : { stored: null };
  }
  const fingerprint = fingerprintOf(stored);
  if (!isSeal(seal)) {
    return writtenUnsealed.get(path) === fingerprint
      ? { stored: body }
      : { stored: body, finding: { kind: "unsealed", fingerprint } };
  }
  if (!sealMatches(key, groupId, seal, body)) {
    return { stored: body, finding: { kind: "edited", fingerprint } };
  }
  raiseSeen(path, seal.generation);
  if (seal.generation < seenBefore) {
    return {
      stored: body,
      finding: { kind: "earlier-copy", fingerprint, found: seal.generation, seen: seenBefore },
    };
  }
  return { stored: body };
}

/** The counter of the file on disk when its seal is valid, else 0. */
async function generationOnDisk(path: string, groupId: string, key: Buffer): Promise<number> {
  try {
    const { body, seal } = split(await readJsonIfExists<unknown>(path));
    return isSeal(seal) && sealMatches(key, groupId, seal, body) ? seal.generation : 0;
  } catch {
    return 0;
  }
}

/**
 * Writes the document with a seal one above every counter this process has seen, or
 * without one when there is no usable key (see `usableKey`).
 */
export async function writeSealedPolicyFile(groupId: string, doc: object): Promise<void> {
  const path = policyFilePath(groupId);
  const key = await usableKey();
  const { body } = split(doc);
  if (!key) {
    await writeGovernanceJson(path, body);
    writtenUnsealed.set(path, fingerprintOf(body));
    return;
  }
  writtenUnsealed.delete(path);
  const generation =
    Math.max(highestSeen.get(path) ?? 0, await generationOnDisk(path, groupId, key)) + 1;
  await writeGovernanceJson(path, {
    ...(body as object),
    seal: { generation, mac: macFor(key, groupId, generation, body) },
  });
  raiseSeen(path, generation);
}

/** Whether the file on disk is still the one a finding describes. */
export async function policyFileStillAsFound(
  groupId: string,
  finding: PolicyFileFinding,
): Promise<boolean> {
  try {
    const stored = await readJsonIfExists<unknown>(policyFilePath(groupId));
    return stored !== null && fingerprintOf(stored) === finding.fingerprint;
  } catch {
    return false;
  }
}

const IN_USE =
  "The file as found is in use (governance detects such a change; it does not prevent it).";
const WHO =
  "An agent allowed to run an interpreter (python, node, a shell), or a person editing policy.json by hand, can do this.";
const WHAT_TO_DO =
  "Compare the rules on the Policy page with the policy entries in this ledger, put back anything that should not be there, and acknowledge with what you found.";

function describeFinding(finding: PolicyFileFinding): string {
  const print = `fingerprint ${finding.fingerprint}`;
  switch (finding.kind) {
    case "edited":
      return `Integrity alert: the policy file was changed outside the governance store: its seal does not match its content (${print}). ${IN_USE} ${WHO} ${WHAT_TO_DO}`;
    case "unsealed":
      return `Integrity alert: the policy file carries no seal (${print}). This is expected once, after upgrading to the version that seals the file; otherwise it was written outside the governance store. ${IN_USE} It is sealed from now on. ${WHO} ${WHAT_TO_DO}`;
    case "earlier-copy":
      return `Integrity alert: the policy file was replaced by an earlier copy of itself (write ${finding.found} put back after write ${finding.seen}; ${print}), so changes made since that copy are no longer in force. ${IN_USE} ${WHO} ${WHAT_TO_DO}`;
    case "removed":
      return `Integrity alert: the policy file was deleted outside the governance store. Governance is now using the shipped baseline, so rules administrators added, stopped agents and per-agent settings no longer apply until they are restored. ${WHO} ${WHAT_TO_DO}`;
  }
  return "Integrity alert: the policy file was changed outside the governance store.";
}

/**
 * Records a finding as a sealed integrity alert, once per finding per process. Returns
 * whether it was recorded now (false when this process already recorded it).
 *
 * Called with no policy lock held: the ledger takes its own, and holding one file lock
 * while taking another is how lock-ordering deadlocks are built.
 */
export async function recordPolicyFileFinding(
  groupId: string,
  finding: PolicyFileFinding,
): Promise<boolean> {
  const path = policyFilePath(groupId);
  const token = `${finding.kind}:${finding.fingerprint}:${finding.seen ?? ""}`;
  const done = reported.get(path) ?? new Set<string>();
  if (done.has(token)) {
    return false;
  }
  // Marked before the append, so loads arriving together record it once.
  done.add(token);
  reported.set(path, done);
  try {
    await appendIntegrityAlert(groupId, {
      toolName: POLICY_FILE_ALERT_ACTION,
      resource: describeFinding(finding),
      ruleId: `policy-file:${finding.kind}:${finding.fingerprint}`,
    });
  } catch (err) {
    done.delete(token);
    throw err;
  }
  return true;
}
