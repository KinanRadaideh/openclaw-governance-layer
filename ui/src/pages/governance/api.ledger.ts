// The audit ledger's shapes: its entries, a chain verification, and the
// integrity routes (T73), mirrored by hand from `src/governance/audit-ledger.ts`,
// `src/gateway/governance-dashboard-integrity.ts`, `src/governance/ledger-witness.ts`
// and `src/governance/ledger-alerts.ts`.
//
// Moved out of `api.ts` whole on 2026-10-04, when T73's routes took that file past
// its 700-line limit: T16's rule, move a subject out rather than suppress the count.
// **Types only**, on the rule `api.agents.ts` states: the client methods stay in
// `api.ts`, so there is one place to look for what this dashboard can call.

/** What this browser keeps about the last ledger head it was shown. */
export type GovernanceLedgerReceipt = {
  groupId: string;
  seq: number;
  hash: string;
  /** The installation's seal over the three above; only the server can make one. */
  receipt: string;
};

export type GovernanceWitnessResult = {
  /**
   * `none`: nothing was brought back. `consistent`: the ledger still holds that
   * entry unchanged. `unverifiable`: the receipt is not this installation's (a
   * reinstall, another organisation), so it is dropped. `contradicted`: the
   * ledger no longer holds the entry as it was, and an alert is in the chain.
   */
  status: "none" | "consistent" | "unverifiable" | "contradicted";
  /** The entry number of the alert a contradiction is recorded under. */
  alertSeq?: number;
  /** The head now, to keep for next time. `null` while the ledger is empty. */
  head: GovernanceLedgerReceipt | null;
};

/** One of the ledger's own integrity alerts that Root has not acknowledged. */
export type GovernanceIntegrityAlert = {
  seq: number;
  action: string;
  timestamp: string;
  summary: string;
  subject: string;
};

export type GovernanceLedgerEntry = {
  seq: number;
  timestamp: string;
  agentId: string;
  sessionKey: string;
  toolName: string;
  resourceKind: string;
  resource: string;
  ruleId: string;
  /**
   * `ungoverned` marks an action the policy layer did not evaluate. A tool with
   * no resource extractor. It was missing from this union while the server had
   * emitted it since complete-record logging landed, so the dashboard's own type
   * disagreed with the data it was rendering.
   */
  decision: "allow" | "deny" | "ask" | "ungoverned";
  prevHash: string;
  hash: string;
  /**
   * What the model said it was doing on the turn that produced this call.
   *
   * §1.6's sixth "Granular Event Tracking" field, and the only one that comes
   * from the *model* rather than the runtime, so it is the only field that
   * lets the trail be read as "the agent said it was doing X, and then did Y".
   *
   * **Absent far more often than present, and that is normal rather than an
   * error**: a turn with no narration, a harness that reports none, a restart
   * between the model speaking and the tool running, or any call not made by a
   * model at all, the CLI, a test, an administrative action.
   *
   * A Viewer receives the placeholder rather than the text (finding 133):
   * narration names files the agent is about to touch and quotes what it has
   * already read, so it discloses strictly more than `resource` does.
   *
   * **Declared here only on 2026-08-28.** The server had recorded and returned
   * it since round twenty-one; this type omitted it, so the dashboard could not
   * render it even as a read-only fact, the same omission `userAsk` had.
   */
  intent?: string;
  /** Present only on administrative entries (policy and account changes). */
  entryKind?: "admin";
  /** Account responsible for an administrative action; `cli` for terminal changes. */
  actor?: string;
  /** The tier the actor held when they acted. Absent on entries predating it. */
  actorRole?: "root" | "administrator" | "user" | "viewer";
};

export type GovernanceLedgerVerification = {
  ok: boolean;
  entriesChecked: number;
  brokenAtSeq?: number;
  reason?: string;
  /**
   * What the check observed, so a green verdict can be examined rather than
   * believed. Mirrored by hand from `LedgerVerification` in
   * `src/governance/audit-ledger.ts`, like every type in this file.
   */
  evidence?: {
    headSeq: number;
    headHash: string;
    checkpointSeq?: number;
    keyed: boolean;
  };
  /** The ledger's own integrity alerts in the chain (T73); intact *since* them. */
  alerts?: Array<{
    seq: number;
    action: string;
    timestamp: string;
    resource: string;
    missingFrom?: number;
    missingTo?: number;
  }>;
};
