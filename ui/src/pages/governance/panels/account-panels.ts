// Account administration and the rule-request queue: the two panels about
// *people* rather than about agents.
//
// ## Why these two together
//
// The same seam the HTTP routes use. `governance-dashboard-accounts.ts` states
// "Root manages people", and `governance-dashboard-rule-requests.ts` states
// "one queue: Viewers read, Users add, Administrators decide" — two files, one
// subject, because a rule request is a person asking a person for something.
// Rendering them together keeps the dashboard's structure legible against the
// API that feeds it: an operator looking at the request queue is looking at
// staff, not at workloads.
//
// ## The props shape, and an honest note about it
//
// Each panel takes three kinds of input, and the split is deliberate:
//
//  - **State it reads** (`users`, `ruleRequests`, `role`, `busy`) — plain data.
//  - **`drafts` + `onDraft`** — the half-typed form fields an operator is in
//    the middle of editing. One patch channel rather than a setter per field,
//    because a panel with eight inputs would otherwise need eight callbacks
//    that all do the same thing, and the eighth is the one somebody forgets.
//  - **`api`, `run`, `confirmThen`** — the page's effect primitives.
//
// That last group is a trade-off worth stating rather than hiding. Naming every
// action individually (`onSetRole`, `onDeleteUser`, …) would document precisely
// what each panel can do, and would mean roughly twenty hand-written callbacks
// for this file alone — each one a place to wire the wrong thing. Passing the
// three primitives instead keeps the call sites explicit *inside* the panel,
// where they read as ordinary code, at the cost of the props no longer being an
// exhaustive capability list. The tests still work either way: a panel can be
// rendered against a stub `api`, which is the property that mattered most.
//
// `confirmThen` in particular stays a primitive rather than becoming
// per-action callbacks, because the *wording* of a confirmation is presentation
// — it names the account and the change in the operator's language — while
// *showing a dialog and running the action* is the page's job. Splitting it
// that way keeps the sentence an operator reads next to the markup it belongs
// to.
import { html, nothing, type TemplateResult } from "lit";
import type { GovernanceRole } from "../../../../../src/governance/roles.ts";
import {
  renderSettingsRow,
  renderSettingsSection,
  renderSettingsSegmented,
  renderSettingsStatus,
  renderSettingsValue,
} from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import type {
  GovernanceApi,
  GovernanceIdentity,
  GovernancePolicyRule,
  GovernanceRuleRequest,
  GovernanceUserRecord,
} from "../api.ts";

/**
 * Roles an account can actually be given.
 *
 * **`root` is deliberately absent.** There is exactly one Root per
 * installation, permanently: the server refuses a second on both routes —
 * creating one outright and promoting an existing account — and Root cannot be
 * demoted either. Offering it in a picker produced a control whose only
 * possible outcome was the error "A Root account already exists; there can be
 * only one", which is what driving the page by hand actually produced.
 *
 * The page already applies this principle elsewhere — a core rule shows no
 * Remove button, because the server would refuse it — and this is the same
 * rule applied to the account tier.
 */
const ASSIGNABLE_ROLE_OPTIONS: ReadonlyArray<{ value: GovernanceRole; label: string }> = [
  { value: "viewer", label: "viewer" },
  { value: "user", label: "user" },
  { value: "administrator", label: "administrator" },
];

/**
 * Shortest password the server will accept.
 *
 * Mirrored by hand from `MIN_PASSWORD_LENGTH` in `src/governance/user-store.ts`,
 * like every type in `api.ts` — the dashboard bundle deliberately does not
 * import from `src/`. The server remains the authority and still enforces it;
 * this copy exists only so the form can state the rule *before* the request
 * rather than relaying the refusal afterwards.
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * What `setAccountPassword` needs. Its own type rather than `AccountsPanelProps`
 * because it is an *action*, not a view: it reads two fields and reports two
 * outcomes, and saying so keeps it callable from anywhere without dragging the
 * whole panel's props along.
 */
export type SetPasswordContext = PanelEffects & {
  identity: GovernanceIdentity | null;
  passwordEdits: Record<string, string>;
  onDraft: (patch: Partial<AccountDrafts>) => void;
  onError: (message: string) => void;
};

/** Form state an operator is part-way through typing. The page owns it; the panels read and patch it. */
export type AccountDrafts = {
  agentEdits: Record<string, string>;
  passwordEdits: Record<string, string>;
  newUserName: string;
  newUserPassword: string;
  newUserRole: GovernanceRole;
  newUserManagedBy: string;
};

export type RuleRequestDrafts = {
  requestKind: GovernancePolicyRule["resourceKind"];
  requestPattern: string;
  requestReason: string;
  requestAgentId: string;
};

/** The page's effect primitives, handed to a panel so it can act without owning state. */
export type PanelEffects = {
  /**
   * A **getter**, not the client itself, and the distinction is load-bearing.
   *
   * `api()` reads the gateway out of the application context, which is not
   * guaranteed to exist when the page first renders. Every call site inside a
   * panel is an event handler, so resolving the client lazily is what the
   * component always did; handing panels a pre-built instance moved that work
   * from click-time to render-time and threw on the first paint. Caught by the
   * characterization tests written before this extraction — the whole reason
   * they were written first.
   */
  api: () => GovernanceApi;
  run: (action: () => Promise<unknown>) => Promise<void>;
  confirmThen: (
    options: { message: string; details?: string; confirmLabel: string; danger?: boolean },
    action: () => Promise<unknown>,
  ) => Promise<void>;
};

export type AccountsPanelProps = PanelEffects & {
  role: GovernanceRole | undefined;
  identity: GovernanceIdentity | null;
  users: readonly GovernanceUserRecord[];
  /** Accounts eligible to manage a User or Viewer (M3). Derived by the page so both panels agree. */
  administrators: readonly GovernanceUserRecord[];
  busy: boolean;
  drafts: AccountDrafts;
  onDraft: (patch: Partial<AccountDrafts>) => void;
  setPassword: (userId: string, password: string) => Promise<void>;
  /**
   * Re-reads the account list after a change the response does not carry.
   * Withholding policy authoring returns `{ ok }`, not the updated roster, so
   * the panel would otherwise keep rendering the old flag until the next poll.
   */
  reloadUsers: () => Promise<void>;
};

export type RuleRequestsPanelProps = PanelEffects & {
  role: GovernanceRole | undefined;
  identity: GovernanceIdentity | null;
  ruleRequests: readonly GovernanceRuleRequest[];
  busy: boolean;
  canAdminister: boolean;
  canManageAnyAgent: boolean;
  drafts: RuleRequestDrafts;
  onDraft: (patch: Partial<RuleRequestDrafts>) => void;
};

export function renderUsersSection(props: AccountsPanelProps): TemplateResult | typeof nothing {
  // Account administration is the Root tier's defining responsibility: the
  // design doc gives Root the human side of the system and Administrator the
  // agent side, so this section is hidden below Root entirely.
  if (props.role !== "root") {
    return nothing;
  }
  return renderSettingsSection({ title: t("governance.users.title") }, [
    ...props.users.map((user) =>
      renderSettingsRow({
        title: user.username,
        description: `${t("governance.users.created")} ${new Date(user.createdAt).toLocaleDateString()}`,
        stacked: true,
        control: html`
          <div class="settings-row__control" style="gap:0.5rem;flex-wrap:wrap">
            ${user.role === "root"
              ? // Root is permanent: it cannot be demoted, and no second Root
                // can be created or promoted. So this row states the role
                // rather than offering a control that would only ever be
                // refused — and says *why*, because "the buttons are missing"
                // is otherwise indistinguishable from a page that failed to
                // render.
                renderSettingsValue(t("governance.users.rootPermanent"))
              : renderSettingsSegmented({
                  value: user.role,
                  disabled: props.busy,
                  options: ASSIGNABLE_ROLE_OPTIONS,
                  // A privilege change used to apply the instant the control
                  // was clicked, including a mis-click onto a higher tier. It
                  // is the most consequential control on the page and had the
                  // lightest interaction of any of them.
                  onChange: (role) =>
                    props.confirmThen(
                      {
                        message: t("governance.confirm.changeRole"),
                        details: `${user.username}: ${user.role} → ${role}`,
                        confirmLabel: t("governance.confirm.changeRoleAction"),
                        danger: role === "administrator",
                      },
                      () => props.api().setUserRole(user.id, role as GovernanceRole),
                    ),
                })}
            ${user.role === "user" || user.role === "viewer"
              ? html`<input
                    class="input"
                    type="text"
                    style="max-width:14rem"
                    aria-label=${t("governance.users.agentsLabel")}
                    placeholder=${t("governance.users.agentsPlaceholder")}
                    .value=${props.drafts.agentEdits[user.id] ?? user.assignedAgents.join(", ")}
                    @input=${(e: Event) => {
                      props.onDraft({
                        agentEdits: {
                          ...props.drafts.agentEdits,
                          [user.id]: (e.target as HTMLInputElement).value,
                        },
                      });
                    }}
                  />
                  <button
                    class="btn"
                    ?disabled=${props.busy}
                    @click=${() =>
                      props.run(async () => {
                        const raw =
                          props.drafts.agentEdits[user.id] ?? user.assignedAgents.join(", ");
                        await props.api().setUserAgents(
                          user.id,
                          raw
                            .split(",")
                            .map((id) => id.trim())
                            .filter(Boolean),
                        );
                        const { [user.id]: _cleared, ...rest } = props.drafts.agentEdits;
                        props.onDraft({ agentEdits: rest });
                      })}
                  >
                    ${t("governance.users.saveAgents")}
                  </button>`
              : nothing}
            ${
              // Root decides how much of the §3.7 User expansion this account
              // actually gets. Offered on the User tier only, because the
              // flag is inert above it and a control that does nothing is a
              // control that misleads — the shape of finding 100.
              //
              // Withholding removes *writing policy*, not the tier: the
              // account keeps reading its agents' policy and ledger,
              // prompting them, stopping them, and submitting rule requests.
              props.role === "root" && user.role === "user"
                ? html`<button
                    class="btn"
                    ?disabled=${props.busy}
                    title=${t("governance.users.policyAuthoringHint")}
                    @click=${() =>
                      props.run(async () => {
                        await props
                          .api()
                          .setUserPolicyAuthoring(user.id, user.canAuthorPolicy === false);
                        await props.reloadUsers();
                      })}
                  >
                    ${user.canAuthorPolicy === false
                      ? t("governance.users.policyAuthoringGrant")
                      : t("governance.users.policyAuthoringWithhold")}
                  </button>`
                : nothing
            }
            <!--
              Setting a password, including Root's own.
              The route was Root-only and enforced from the day scrypt
              parameters became upgradeable, and no surface ever called it —
              so the account that governs every other one had a password that
              could not be changed after it was first chosen, on a page whose
              bootstrap step is already irreversible. Offered per row rather
              than as a separate panel because the account it acts on has to
              be unmistakable: a password field that could be pointed at the
              wrong person by a mis-set dropdown is a worse control than none.
            -->
            <input
              class="input"
              type="password"
              autocomplete="new-password"
              style="max-width:14rem"
              aria-label=${t("governance.users.newPasswordFor", { username: user.username })}
              placeholder=${t("governance.users.passwordPlaceholder")}
              .value=${props.drafts.passwordEdits[user.id] ?? ""}
              @input=${(e: Event) => {
                props.onDraft({
                  passwordEdits: {
                    ...props.drafts.passwordEdits,
                    [user.id]: (e.target as HTMLInputElement).value,
                  },
                });
              }}
            />
            <button
              class="btn"
              ?disabled=${props.busy || !(props.drafts.passwordEdits[user.id] ?? "").trim()}
              @click=${() => props.setPassword(user.id, user.username)}
            >
              ${t("governance.users.setPassword")}
            </button>
            <button
              class="btn btn--danger"
              ?disabled=${props.busy || user.username === props.identity?.username}
              title=${user.username === props.identity?.username
                ? t("governance.users.cannotDeleteSelf")
                : ""}
              @click=${() =>
                props.confirmThen(
                  {
                    message: t("governance.confirm.deleteUser"),
                    details: user.username,
                    confirmLabel: t("governance.users.delete"),
                  },
                  () => props.api().deleteUser(user.id),
                )}
            >
              ${t("governance.users.delete")}
            </button>
          </div>
        `,
      }),
    ),
    renderSettingsRow({
      title: t("governance.users.add"),
      description: t("governance.users.addHint"),
      stacked: true,
      control: html`
        <div class="settings-row__control" style="gap:0.5rem;flex-wrap:wrap">
          <input
            class="input"
            type="text"
            autocomplete="off"
            aria-label=${t("governance.users.newUsernameLabel")}
            placeholder=${t("governance.login.username")}
            .value=${props.drafts.newUserName}
            @input=${(e: Event) => {
              props.onDraft({ newUserName: (e.target as HTMLInputElement).value });
            }}
          />
          <input
            class="input"
            type="password"
            autocomplete="new-password"
            aria-label=${t("governance.users.newPasswordLabel")}
            placeholder=${t("governance.users.passwordPlaceholder")}
            .value=${props.drafts.newUserPassword}
            @input=${(e: Event) => {
              props.onDraft({ newUserPassword: (e.target as HTMLInputElement).value });
            }}
          />
          <select
            class="input"
            aria-label=${t("governance.users.newRoleLabel")}
            .value=${props.drafts.newUserRole}
            @change=${(e: Event) => {
              props.onDraft({
                newUserRole: (e.target as HTMLSelectElement).value as GovernanceRole,
              });
            }}
          >
            ${ASSIGNABLE_ROLE_OPTIONS.map(
              (option) => html`<option value=${option.value}>${option.label}</option>`,
            )}
          </select>
          ${props.drafts.newUserRole === "user" || props.drafts.newUserRole === "viewer"
            ? html`<select
                class="input"
                aria-label=${t("governance.users.managedByLabel")}
                title=${t("governance.users.managedByHint")}
                .value=${props.drafts.newUserManagedBy}
                @change=${(e: Event) => {
                  props.onDraft({ newUserManagedBy: (e.target as HTMLSelectElement).value });
                }}
              >
                <option value="">${t("governance.users.managedByPlaceholder")}</option>
                ${props.administrators.map(
                  (admin) => html`<option value=${admin.id}>${admin.username}</option>`,
                )}
              </select>`
            : nothing}
          ${(props.drafts.newUserRole === "user" || props.drafts.newUserRole === "viewer") &&
          props.administrators.length === 0
            ? // The tier cannot be created at all until somebody can answer
              // for it, and saying so beats a server error the operator has
              // to interpret. Root's way forward is to create an
              // Administrator first — possibly one they sign into themselves.
              html`<span class="settings-hint">${t("governance.users.noAdministrators")}</span>`
            : nothing}
          <button
            class="btn btn--primary"
            ?disabled=${props.busy ||
            !props.drafts.newUserName ||
            !props.drafts.newUserPassword ||
            ((props.drafts.newUserRole === "user" || props.drafts.newUserRole === "viewer") &&
              !props.drafts.newUserManagedBy)}
            @click=${() =>
              props.run(async () => {
                await props.api().createUser({
                  username: props.drafts.newUserName,
                  password: props.drafts.newUserPassword,
                  role: props.drafts.newUserRole,
                  ...(props.drafts.newUserManagedBy
                    ? { managedBy: props.drafts.newUserManagedBy }
                    : {}),
                });
                props.onDraft({ newUserName: "" });
                props.onDraft({ newUserPassword: "" });
                props.onDraft({ newUserManagedBy: "" });
              })}
          >
            ${t("governance.users.addButton")}
          </button>
        </div>
      `,
    }),
  ]);
}

export function renderRuleRequestsSection(
  props: RuleRequestsPanelProps,
): TemplateResult | typeof nothing {
  const pending = props.ruleRequests.filter((request) => request.status === "pending");
  const recent = props.ruleRequests
    .filter((request) => request.status !== "pending")
    .slice(-5)
    .toReversed();
  // Users propose; Administrators decide. Both see the queue.
  const canPropose = props.canManageAnyAgent || props.role === "user";
  const canDecide = props.canAdminister;
  return renderSettingsSection({ title: t("governance.requests.title") }, [
    ...pending.map((request) =>
      renderSettingsRow({
        // A setting request has no pattern; an empty code block for it would
        // read as a rule request whose pattern failed to load. Applied to the
        // decided list as well as the pending one — a request an operator
        // reviews and a request they later look back at are the same object.
        title:
          request.kind === "agent-setting"
            ? html`${t("governance.requests.settingTitle", {
                setting:
                  request.setting === "ask"
                    ? t("governance.requests.settingAsk")
                    : t("governance.requests.settingMode"),
                value: request.value ?? "",
              })}`
            : html`<code>${request.pattern}</code>`,
        // Scope is stated first and unambiguously. An approver deciding from
        // pattern and reason alone cannot tell a single-agent request from
        // one that will bind every agent in the installation, and those are
        // very different decisions.
        description: html`${renderSettingsStatus(
          request.agentId
            ? { kind: "ok", label: `${t("governance.requests.scopeAgent")} ${request.agentId}` }
            : { kind: "warn", label: t("governance.requests.scopeGlobal") },
        )}
        ${request.kind === "agent-setting"
          ? t("governance.requests.settingKind")
          : request.resourceKind}
        · ${t("governance.requests.by")} ${request.requestedBy} — ${request.reason}`,
        control: canDecide
          ? html`
              <div class="settings-row__control" style="gap:0.5rem">
                <button
                  class="btn btn--primary"
                  ?disabled=${props.busy}
                  @click=${() => props.run(() => props.api().decideRuleRequest(request.id, true))}
                >
                  ${t("governance.requests.approve")}
                </button>
                <button
                  class="btn btn--danger"
                  ?disabled=${props.busy}
                  @click=${() => props.run(() => props.api().decideRuleRequest(request.id, false))}
                >
                  ${t("governance.requests.reject")}
                </button>
              </div>
            `
          : renderSettingsStatus({ kind: "muted", label: t("governance.requests.pending") }),
      }),
    ),
    ...recent.map((request) =>
      renderSettingsRow({
        // A setting request has no pattern; an empty code block for it would
        // read as a rule request whose pattern failed to load. Applied to the
        // decided list as well as the pending one — a request an operator
        // reviews and a request they later look back at are the same object.
        title:
          request.kind === "agent-setting"
            ? html`${t("governance.requests.settingTitle", {
                setting:
                  request.setting === "ask"
                    ? t("governance.requests.settingAsk")
                    : t("governance.requests.settingMode"),
                value: request.value ?? "",
              })}`
            : html`<code>${request.pattern}</code>`,
        description: `${t("governance.requests.by")} ${request.requestedBy} · ${t("governance.requests.decidedBy")} ${request.decidedBy ?? "—"}`,
        control: renderSettingsStatus({
          kind: request.status === "approved" ? "ok" : "warn",
          label: request.status,
        }),
      }),
    ),
    pending.length === 0 && recent.length === 0
      ? renderSettingsRow({
          title: t("governance.requests.empty"),
          description: t("governance.requests.emptyHint"),
        })
      : nothing,
    canPropose
      ? renderSettingsRow({
          title: t("governance.requests.submit"),
          description: t("governance.requests.submitHint"),
          stacked: true,
          control: html`
            <div class="settings-row__control" style="gap:0.5rem;flex-wrap:wrap">
              <select
                class="input"
                aria-label=${t("governance.policy.kindLabel")}
                .value=${props.drafts.requestKind}
                @change=${(e: Event) => {
                  props.onDraft({
                    requestKind: (e.target as HTMLSelectElement)
                      .value as GovernancePolicyRule["resourceKind"],
                  });
                }}
              >
                <option value="command">command</option>
                <option value="path">path</option>
                <option value="network">network</option>
              </select>
              <input
                class="input"
                type="text"
                aria-label=${t("governance.policy.patternLabel")}
                placeholder=${t("governance.policy.patternPlaceholder")}
                .value=${props.drafts.requestPattern}
                @input=${(e: Event) => {
                  props.onDraft({ requestPattern: (e.target as HTMLInputElement).value });
                }}
              />
              <input
                class="input"
                type="text"
                style="min-width:14rem"
                aria-label=${t("governance.requests.reasonLabel")}
                placeholder=${t("governance.requests.reasonPlaceholder")}
                .value=${props.drafts.requestReason}
                @input=${(e: Event) => {
                  props.onDraft({ requestReason: (e.target as HTMLInputElement).value });
                }}
              />
              <input
                class="input"
                type="text"
                aria-label=${t("governance.requests.agentLabel")}
                placeholder=${t("governance.requests.agentPlaceholder")}
                .value=${props.drafts.requestAgentId}
                @input=${(e: Event) => {
                  props.onDraft({ requestAgentId: (e.target as HTMLInputElement).value });
                }}
              />
              <button
                class="btn btn--primary"
                ?disabled=${props.busy ||
                !props.drafts.requestPattern ||
                !props.drafts.requestReason}
                @click=${() =>
                  props.run(async () => {
                    const agentId = props.drafts.requestAgentId.trim();
                    await props.api().submitRuleRequest({
                      resourceKind: props.drafts.requestKind,
                      pattern: props.drafts.requestPattern,
                      reason: props.drafts.requestReason,
                      // Sent only when non-empty: an empty string would be a
                      // request for an agent literally named "", whereas an
                      // absent field is the deliberate "installation-wide"
                      // choice the server understands.
                      ...(agentId ? { agentId } : {}),
                    });
                    props.onDraft({ requestPattern: "" });
                    props.onDraft({ requestReason: "" });
                    props.onDraft({ requestAgentId: "" });
                  })}
              >
                ${t("governance.requests.submitButton")}
              </button>
            </div>
          `,
        })
      : nothing,
  ]);
}

/**
 * Sets one account's password, including Root's own.
 *
 * Two things make this more than a form submit, and both are about telling
 * the operator the truth before they commit:
 *
 *   1. **Every session for that account is revoked** by the server, because a
 *      password change is usually a response to it being compromised. When
 *      Root changes its own password that includes the session making the
 *      request, so the page is about to sign itself out. Saying that
 *      afterwards would read as a bug; saying it in the confirmation makes it
 *      the expected outcome.
 *   2. **Root's password has no other recovery path.** Bootstrap refuses once
 *      an account exists and Root cannot be demoted or deleted, so this
 *      control is the only way to change it — which is exactly why it is
 *      worth confirming rather than firing on a single click.
 *
 * The length rule is checked here as well as on the server, for the same
 * reason the bootstrap form checks it: an operator should be told the rule by
 * the form that has to satisfy it, not by a refusal afterwards.
 */
export async function setAccountPassword(
  userId: string,
  username: string,
  ctx: SetPasswordContext,
): Promise<void> {
  const password = (ctx.passwordEdits[userId] ?? "").trim();
  if (!password) {
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    ctx.onError(t("governance.login.passwordTooShort", { min: String(MIN_PASSWORD_LENGTH) }));
    return;
  }
  const isSelf = username === ctx.identity?.username;
  await ctx.confirmThen(
    {
      message: isSelf
        ? t("governance.confirm.setOwnPassword")
        : t("governance.confirm.setPassword"),
      details: username,
      confirmLabel: t("governance.users.setPassword"),
      danger: isSelf,
    },
    async () => {
      await ctx.api().setUserPassword(userId, password);
      // Cleared whatever happens next: on a self-reset the page is about to
      // return to sign-in, and leaving a password sitting in a field behind
      // that transition is the kind of thing nobody notices until it matters.
      ctx.onDraft({ passwordEdits: { ...ctx.passwordEdits, [userId]: "" } });
    },
  );
}
