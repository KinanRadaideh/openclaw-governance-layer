// The deployment report's rows about the audit ledger's own integrity (T73): whether
// this process could rewrite the ledger in place, whether it can still rotate, and
// whether the ledger has raised an alert Root has not acknowledged.
//
// Split from `deployment-status.ts` on 2026-10-04 to keep that file within its
// line limit; it returns plain rows and `readDeploymentStatus` adds them, as it
// does every row it writes.
import { ledgerRotationFailure } from "./audit-ledger.js";
import { unacknowledgedLedgerAlerts } from "./ledger-alerts.js";
import { ledgerProtectionFailure, probeLedgerAppendOnly } from "./ledger-append-only.js";
import { ledgerFilePath } from "./paths.js";

export type LedgerIntegrityRow = {
  id: string;
  title: string;
  status: "pass" | "warn" | "fail" | "unknown";
  detail: string;
  remediation?: string;
};

function row(
  id: string,
  title: string,
  status: LedgerIntegrityRow["status"],
  detail: string,
  remediation?: string,
): LedgerIntegrityRow {
  return { id, title, status, detail, ...(remediation ? { remediation } : {}) };
}

/**
 * Whether the active ledger is append-only **for this process** (T73, idea 2).
 *
 * Measured by `probeLedgerAppendOnly` rather than read from configuration: an
 * ACL that is in place but does not bind an elevated process would otherwise
 * be reported as protection this Gateway does not have.
 */
async function appendOnlyRow(
  platform: string,
  ledgerPath: string | undefined,
): Promise<LedgerIntegrityRow> {
  const id = "deployment.ledger_append_only";
  const title = "Ledger cannot be rewritten in place";
  if (!ledgerPath) {
    return row(
      id,
      title,
      "pass",
      "No ledger has been written yet; it is protected when its first entry is.",
    );
  }
  const probe = await probeLedgerAppendOnly(ledgerPath);
  if (probe === "append-only") {
    return row(
      id,
      title,
      "pass",
      "The operating system refuses to open the active ledger for rewriting, so it can only be appended to. Deleting it and writing a shortened copy is still possible; the checkpoint comparison and the dashboard's witness detect that.",
    );
  }
  if (platform === "win32") {
    const failure = ledgerProtectionFailure(ledgerPath);
    return row(
      id,
      title,
      "warn",
      failure
        ? `The append-only permission could not be applied to the active ledger: ${failure}`
        : "The active ledger can be opened for rewriting by this process. Either the append-only permission is not applied yet (it is applied on the next entry), or the Gateway is running elevated: an elevated process overrides file permissions, and so do the agents it starts.",
      "Run the Gateway as an ordinary, non-elevated user. Truncation is still detected by the checkpoint comparison and the dashboard's witness.",
    );
  }
  return row(
    id,
    title,
    "warn",
    `The active ledger can be rewritten in place by the user running the Gateway, and on ${platform} an unprivileged process cannot make a file append-only for itself. Truncation is still detected by the checkpoint comparison and the dashboard's witness.`,
    "Run the Gateway as a dedicated user that agents' commands do not share. chattr +a (as root) also works, but stops the ledger rotating until it is lifted.",
  );
}

/** Every T73 row for one organisation, in the order the report shows them. */
export async function ledgerIntegrityChecks(
  groupId: string,
  platform: string,
  ledgerPresent: boolean,
): Promise<LedgerIntegrityRow[]> {
  const rows = [await appendOnlyRow(platform, ledgerPresent ? ledgerFilePath(groupId) : undefined)];
  const rotationFailure = ledgerRotationFailure(groupId);
  if (rotationFailure) {
    rows.push(
      row(
        "deployment.ledger_rotation",
        "Ledger rotates",
        "warn",
        `The active ledger could not be moved aside when it passed its size limit (${rotationFailure}), so it keeps growing. Nothing is lost: every entry is still written.`,
        "If the file was made append-only with chattr +a, rotation needs the attribute lifted briefly by root; otherwise check the governance directory's permissions.",
      ),
    );
  }
  // An unusable key is reported by its own row; it must not take the whole report
  // down with it, so the alerts are "could not check" in that case.
  const title = "No unacknowledged ledger integrity alerts";
  let alerts: Awaited<ReturnType<typeof unacknowledgedLedgerAlerts>>;
  try {
    alerts = await unacknowledgedLedgerAlerts(groupId);
  } catch (err) {
    rows.push(
      row(
        "deployment.ledger_alerts",
        title,
        "unknown",
        `The ledger's integrity alerts could not be read, because their seals cannot be checked: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    return rows;
  }
  rows.push(
    alerts.length === 0
      ? row(
          "deployment.ledger_alerts",
          title,
          "pass",
          "The ledger has raised no integrity alert that Root has not reviewed.",
        )
      : row(
          "deployment.ledger_alerts",
          title,
          "fail",
          `${alerts.length} integrity alert${alerts.length === 1 ? "" : "s"} not yet acknowledged, the first at entry #${alerts[0]?.seq}: entries were removed from, or rewritten in, the audit ledger.`,
          "Review each alert at the top of the dashboard, find out what happened, and acknowledge it with the reason.",
        ),
  );
  return rows;
}
