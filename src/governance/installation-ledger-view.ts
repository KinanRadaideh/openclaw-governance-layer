// The installation ledger's events in Root's audit view (T97).
//
// Events that belong to no organisation (an unregistered agent refused at the
// gate, a prompt sent to one, a failed sign-in under a name nobody holds, the
// copy of an organisation's deletion) are written to the installation chain,
// `INSTALLATION_LEDGER_GROUP`. The dashboard read only the organisation's chain,
// so nobody could see them there. This module decides who may, and combines the
// two chains for the response without changing either (design
// `mg/T97-INSTALLATION-LEDGER-VIEW-DESIGN.md`, D1–D8).
import type { LedgerEntry, LedgerVerification } from "./audit-ledger.js";
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
