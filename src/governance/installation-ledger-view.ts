// The installation ledger's events in Root's audit view (T97).
//
// Events that belong to no organisation (an unregistered agent refused at the
// gate, a prompt sent to one, the copy of an organisation's deletion) are written
// to the installation chain, `INSTALLATION_LEDGER_GROUP`, and so is every failed
// or locked-out sign-in, a real account's included (finding 457: recorded alike,
// so the trail is no account-existence oracle). The dashboard read only the organisation's chain,
// so nobody could see them there. This module decides who may, and combines the
// two chains for the response without changing either (design
// `mg/T97-INSTALLATION-LEDGER-VIEW-DESIGN.md`, D1–D8).
import {
  tailLedger,
  verifyLedgerChain,
  type LedgerEntry,
  type LedgerVerification,
} from "./audit-ledger.js";
import { INSTALLATION_LEDGER_GROUP } from "./paths.js";
import type { GovernanceRole } from "./roles.js";
import { listUsers } from "./user-store.js";

/** The marker an installation entry carries in a response (D3). Never stored, never hashed. */
export const INSTALLATION_LEDGER_SCOPE = "installation";

/** A ledger entry as the route returns it: an organisation entry, or a marked installation one. */
export type LedgerViewEntry = LedgerEntry & { ledgerScope?: typeof INSTALLATION_LEDGER_SCOPE };

/** What `ledger/verify` returns: the organisation's result, and Root's second chain (D5). */
export type LedgerViewVerification = LedgerVerification & { installation?: LedgerVerification };

/**
 * The installation's organisation: the one `groupId` its accounts belong to, or `undefined`
 * when there is none yet or more than one (D2). Accounts that predate organisations carry no
 * `groupId` and are ignored, as `wouldCreateSecondOrganisation` ignores them. Reads the store,
 * not the test-only multi-organisation switch: this is a fact about the data.
 */
export async function installationOrganisation(): Promise<string | undefined> {
  const groups = new Set(
    (await listUsers())
      .map((user) => user.groupId?.trim())
      .filter((id): id is string => Boolean(id)),
  );
  return groups.size === 1 ? [...groups][0] : undefined;
}

/**
 * Whether this reader receives the installation chain (D2): Root, of the installation's one
 * organisation. Every other reader gets exactly what it got before T97.
 */
export async function mayReadInstallationLedger(reader: {
  role: GovernanceRole;
  groupId?: string;
}): Promise<boolean> {
  if (reader.role !== "root") {
    return false;
  }
  const groupId = reader.groupId?.trim();
  return Boolean(groupId) && (await installationOrganisation()) === groupId;
}

/** Why a chain file could not be read, in words: the error code, or its message. */
function unreadable(err: unknown): string {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return `the installation ledger could not be read (${code ?? String(err)})`;
}

/**
 * The installation chain's newest `limit` entries for Root's view, or none when the file cannot
 * be read (finding 456). It is a second file: a fault in it must cost Root those entries, never
 * the organisation's view, which every other tier is still answered. Root's Verify says why.
 */
export async function readInstallationChain(limit: number): Promise<LedgerEntry[]> {
  try {
    return await tailLedger(INSTALLATION_LEDGER_GROUP, limit);
  } catch {
    return [];
  }
}

/**
 * The installation chain's own verification (D5). A file that cannot be read is a failed verdict
 * of that chain, beside the organisation's, never a failure of the whole response (finding 456).
 */
export async function verifyInstallationChain(): Promise<LedgerVerification> {
  try {
    return await verifyLedgerChain(INSTALLATION_LEDGER_GROUP);
  } catch (err) {
    return { ok: false, entriesChecked: 0, reason: unreadable(err) };
  }
}

/** Milliseconds since the epoch, or `undefined` for a timestamp that does not parse. */
function timeOf(entry: LedgerEntry): number | undefined {
  const time = Date.parse(entry.timestamp);
  return Number.isFinite(time) ? time : undefined;
}

/**
 * Combines the two chains into one list, oldest first (D4).
 *
 * A merge, not a sort: each input is already in its own chain order, and that order is kept
 * whatever the timestamps say (a clock stepped back must not reorder one chain against itself).
 * At each step the earlier head goes first; equal times, or a time that does not parse, put the
 * organisation's entry first. Each installation entry is marked; organisation entries are passed
 * through unchanged.
 */
export function mergeLedgerViews(
  organisation: readonly LedgerEntry[],
  installation: readonly LedgerEntry[],
): LedgerViewEntry[] {
  const merged: LedgerViewEntry[] = [];
  let o = 0;
  let i = 0;
  while (o < organisation.length || i < installation.length) {
    const fromOrganisation = organisation[o];
    const fromInstallation = installation[i];
    if (fromInstallation === undefined) {
      merged.push(fromOrganisation as LedgerEntry);
      o += 1;
      continue;
    }
    if (fromOrganisation !== undefined) {
      const orgTime = timeOf(fromOrganisation);
      const instTime = timeOf(fromInstallation);
      if (orgTime === undefined || instTime === undefined || orgTime <= instTime) {
        merged.push(fromOrganisation);
        o += 1;
        continue;
      }
    }
    merged.push({ ...fromInstallation, ledgerScope: INSTALLATION_LEDGER_SCOPE });
    i += 1;
  }
  return merged;
}
