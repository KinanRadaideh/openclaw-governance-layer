// Read-only oversight panels: the audit ledger, the deployment and network
// report, and the host's resource view.
//
// ## Why this file exists
//
// Extracted from `governance-page.ts` (T16), which was 2,412 code lines — the
// last file in the project over the limit inherited from upstream OpenClaw's
// `.oxlintrc.json`. The grouping is not arbitrary: it is the **same seam the
// HTTP routes were split along on the same day**. `governance-dashboard-oversight.ts`
// serves the ledger, sessions, system and pending-decision reads under one rule
// ("Viewer and above, nothing changes state, every answer filtered"), and this
// file renders what that route returns. The panel that shows a thing and the
// route that serves it now live at the same granularity, which means a reviewer
// asking "who can see the ledger?" reads one route file and one panel file.
//
// ## Why pure functions of explicit props
//
// Every panel here takes what it needs as an argument and reaches into no
// component state. Three reasons, in order of how much they matter:
//
//  1. **The type checker verifies the wiring.** A field the page forgets to
//     pass, or passes with the wrong type, is a compile error rather than an
//     empty region on an operator's screen — which is this project's worst bug
//     class (an outcome that is invisible rather than wrong).
//  2. **A panel can be rendered without a page.** `rule-filter.ts` and
//     `ledger-filter.ts` already set that pattern in this directory, and it is
//     why their logic has always been tested while the component's was not.
//  3. **The dependencies are readable.** `renderSystemSection` takes one
//     argument, and that is the honest statement of what the host resource view
//     depends on. A method reaching into `this` says nothing.
//
// Authorization is deliberately *not* a property of this file, unlike its route
// counterpart. The deployment panel checks the caller's role, but only to avoid
// rendering a section the server would refuse anyway — the tier is enforced in
// `governance-dashboard-oversight.ts` and asserted in the privilege matrix.
// Hiding a panel is a convenience; it is never the control.
import { html, nothing, type TemplateResult } from "lit";
import type { GovernanceRole } from "../../../../../src/governance/roles.ts";
import {
  renderSettingsRow,
  renderSettingsSection,
  renderSettingsStatus,
  renderSettingsValue,
} from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import type {
  GovernanceDeploymentCheck,
  GovernanceDeploymentStatus,
  GovernanceLedgerEntry,
  GovernanceLedgerVerification,
  GovernanceSystemStatus,
} from "../api.ts";
import { describeLedgerEntry, filterLedger, type LedgerFilter } from "../ledger-filter.ts";

export type LedgerPanelProps = {
  ledger: readonly GovernanceLedgerEntry[];
  ledgerFilter: LedgerFilter;
  verification: GovernanceLedgerVerification | null;
  busy: boolean;
  /** Called with the filter the operator chose; the page owns the state. */
  onFilter: (value: LedgerFilter) => void;
  /** Runs a chain verification. The page owns the request and the busy flag. */
  onVerify: () => void;
};

export type DeploymentPanelProps = {
  deployment: GovernanceDeploymentStatus | null;
  /** The caller's tier, used only to hide a panel the server would refuse. */
  role: GovernanceRole | undefined;
};

export type FreshnessProps = {
  /** `null` until the first refresh completes, which is when there is nothing to date. */
  lastRefreshedAt: number | null;
  /** True when the last refresh returned some sections and failed others. */
  partialFailure: boolean;
};

/**
 * States how current the page is.
 *
 * Everything here is oversight information, so "when was this true?" is part of
 * the information. Nothing refreshed on its own before and nothing said how old
 * the view was, so "no agent sessions running" could be hours stale on the panel
 * meant to catch a runaway agent.
 *
 * **Moved out of `governance-page.ts` on 2026-08-28**, and the reason is worth a
 * line. It was the last piece of markup left in the page, which the split (T16)
 * had established should hold state and effects only — and M6's registry wiring
 * pushed the file from 696 code lines back over the 700-line limit T16 closed.
 * The limit was reported as clean in the same commit that broke it, so the
 * regression survived a documentation pass that asserted its absence. Extracting
 * the one thing that was already in the wrong file fixes both.
 */
export function renderFreshness(props: FreshnessProps): TemplateResult | typeof nothing {
  if (props.lastRefreshedAt === null) {
    return nothing;
  }
  if (props.partialFailure) {
    return html`<div class="settings-empty" role="status">
      ${t("governance.freshness.partial")}
    </div>`;
  }
  return nothing;
}

export function renderLedgerSection(props: LedgerPanelProps): TemplateResult {
  const { verification, ledger, ledgerFilter, busy, onFilter, onVerify } = props;
  // Administrative entries and agent entries answer different questions, and
  // an installation doing real work produces far more of the latter. Without
  // a filter, "who changed this rule?" means scrolling past thousands of tool
  // calls — the trail exists but is not usable, which for an accountability
  // feature amounts to much the same thing.
  const visibleLedger = filterLedger(ledger, ledgerFilter);
  const filterButton = (value: LedgerFilter, label: string) => html`<button
    class="btn ${ledgerFilter === value ? "btn-primary" : ""}"
    aria-pressed=${ledgerFilter === value ? "true" : "false"}
    @click=${() => {
      onFilter(value);
    }}
  >
    ${label}
  </button>`;
  return renderSettingsSection(
    {
      title: t("governance.ledger.title"),
      actions: html`${filterButton("all", t("governance.ledger.filterAll"))}
        ${filterButton("agent", t("governance.ledger.filterAgent"))}
        ${filterButton("admin", t("governance.ledger.filterAdmin"))}
        ${filterButton("auth", t("governance.ledger.filterAuth"))}
        <button class="btn" ?disabled=${busy} @click=${onVerify}>
          ${t("governance.ledger.verify")}
        </button>`,
    },
    [
      verification
        ? renderSettingsRow({
            title: t("governance.ledger.integrity"),
            control: renderSettingsStatus({
              kind: verification.ok ? "ok" : "warn",
              label: verification.ok
                ? `${t("governance.ledger.intact")} (${verification.entriesChecked})`
                : verification.brokenAtSeq === undefined
                  ? // No sequence number when the failure is not tied to one
                    // entry — an unparseable line, or a checkpoint saying the
                    // file is short. Printing "#undefined" in exactly the
                    // situation the feature exists for undermined the one
                    // message an operator most needs to trust.
                    `${t("governance.ledger.tampered")}: ${verification.reason}`
                  : `${t("governance.ledger.tampered")} #${verification.brokenAtSeq}: ${verification.reason}`,
            }),
          })
        : nothing,
      visibleLedger.length === 0
        ? renderSettingsRow({
            title: t("governance.ledger.empty"),
            description: t("governance.ledger.emptyHint"),
          })
        : nothing,
      ...visibleLedger
        // `toReversed`, which copies — the `slice()` that used to guard the
        // in-place `reverse()` is no longer needed, and `visibleLedger` is
        // derived from the page's `ledger` state, so reversing it in place would have
        // reordered the state behind every other reader of that array.
        .toReversed()
        .slice(0, 50)
        .map((entry) =>
          renderSettingsRow({
            title: html`<code>#${entry.seq} ${entry.toolName}</code> ${entry.resource}`,
            // The intent rides *under* the description rather than inside it,
            // and is omitted entirely when absent. Two reasons, both learned
            // here: absence is the common case, so a row must not grow an empty
            // "Intent:" label that reads as the model having said nothing when
            // in fact nothing was captured; and this is model-authored text
            // beside a decision the model is the subject of, so it should never
            // be mistaken for something the layer concluded.
            description: html`${describeLedgerEntry(entry, {
              by: t("governance.ledger.by"),
            })}${entry.intent
              ? html`<span style="display:block;margin-top:0.25rem;opacity:0.85">
                  <em>${t("governance.ledger.intent")}:</em> ${entry.intent}
                </span>`
              : nothing}`,
            control: renderSettingsStatus({
              kind:
                entry.entryKind === "admin"
                  ? "accent"
                  : entry.decision === "allow"
                    ? "ok"
                    : entry.decision === "deny"
                      ? "warn"
                      : "muted",
              label:
                entry.entryKind === "admin" ? t("governance.ledger.adminBadge") : entry.decision,
            }),
          }),
        ),
    ],
  );
}

/**
 * The deployment and network report (backlog item A7).
 *
 * Root only, and gated **server-side** as well — hiding the panel is a
 * convenience, not the control. It reports the bind mode, port, gateway auth
 * mode and governance directory, which together are a map of how to reach and
 * attack this installation, so the tier is enforced in
 * `governance-dashboard-api.ts` and asserted in the privilege matrix.
 *
 * Read-only by design: changing a bind address from the dashboard you are
 * connected through can lock you out of it in one click.
 */
export function renderDeploymentSection(
  props: DeploymentPanelProps,
): TemplateResult | typeof nothing {
  if (props.role !== "root") {
    return nothing;
  }
  const report = props.deployment;
  if (!report) {
    return nothing;
  }
  const kindFor = (status: GovernanceDeploymentCheck["status"]) =>
    status === "pass" ? "ok" : status === "warn" ? "warn" : status === "fail" ? "danger" : "muted";
  const facts = report.facts;
  return renderSettingsSection(
    {
      title: t("governance.deployment.title"),
      description: t("governance.deployment.hint"),
    },
    [
      renderSettingsRow({
        title: t("governance.deployment.summary"),
        control: renderSettingsStatus({
          kind: kindFor(report.overall),
          label: t("governance.deployment.counts", {
            fail: String(report.summary.fail),
            warn: String(report.summary.warn),
            unknown: String(report.summary.unknown),
            pass: String(report.summary.pass),
          }),
        }),
      }),
      ...(facts
        ? [
            renderSettingsRow({
              title: t("governance.deployment.facts.gateway"),
              control: renderSettingsValue(
                `${facts.bind}:${facts.port} · ${facts.authMode} · ${facts.platform}`,
              ),
            }),
            renderSettingsRow({
              title: t("governance.deployment.facts.dir"),
              description: facts.governanceDirRelocated
                ? t("governance.deployment.facts.relocated")
                : undefined,
              control: renderSettingsValue(facts.governanceDir),
            }),
          ]
        : []),
      ...report.checks.map((check) =>
        renderSettingsRow({
          title: check.title,
          // The remediation rides on the description rather than getting its
          // own row: an operator reading a failure needs the fix in the same
          // glance, and a separate row would scan as a separate finding.
          description: check.remediation ? `${check.detail} → ${check.remediation}` : check.detail,
          control: renderSettingsStatus({
            kind: kindFor(check.status),
            label: t(`governance.deployment.status.${check.status}`),
          }),
        }),
      ),
      ...(facts?.gatewayNotes ?? []).map((note) =>
        renderSettingsRow({
          title: note,
          control: renderSettingsStatus({
            kind: "muted",
            label: t("governance.deployment.note"),
          }),
        }),
      ),
    ],
  );
}

export function renderSystemSection(
  systemStatus: GovernanceSystemStatus | null,
): TemplateResult | typeof nothing {
  const status = systemStatus;
  if (!status) {
    return nothing;
  }
  const gib = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
  const duration = (seconds: number) => {
    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };
  return renderSettingsSection({ title: t("governance.system.title") }, [
    renderSettingsRow({
      title: t("governance.system.memory"),
      control: renderSettingsStatus({
        // A nearly-full host is the condition a runaway agent produces, so
        // surface it as a warning rather than a neutral number.
        kind: status.usedMemoryPercent > 90 ? "warn" : "ok",
        label: `${status.usedMemoryPercent}% of ${gib(status.totalMemoryBytes)}`,
      }),
    }),
    renderSettingsRow({
      title: t("governance.system.cpu"),
      control: renderSettingsValue(
        status.loadAverageSupported
          ? `${status.cpuCount} cores · load ${status.loadAverage.map((n) => n.toFixed(2)).join(" / ")}`
          : `${status.cpuCount} cores`,
      ),
    }),
    renderSettingsRow({
      title: t("governance.system.uptime"),
      control: renderSettingsValue(
        `${t("governance.system.host")} ${duration(status.uptimeSeconds)} · ${t("governance.system.gateway")} ${duration(status.processUptimeSeconds)}`,
      ),
    }),
  ]);
}
