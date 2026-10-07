// Account administration and the rule-request queue: the two panels about
// *people* rather than about agents.
//
// ## Why these two together
//
// The same seam the HTTP routes use. `governance-dashboard-accounts.ts` states
// "Root manages people", and `governance-dashboard-rule-requests.ts` states
// "one queue: Viewers read, Users add, Administrators decide", two files, one
// subject, because a rule request is a person asking a person for something.
// Rendering them together keeps the dashboard's structure legible against the
// API that feeds it: an operator looking at the request queue is looking at
// staff, not at workloads.
//
// ## The props shape, and an honest note about it
//
// Each panel takes three kinds of input, and the split is deliberate:
//
//  - **State it reads** (`users`, `ruleRequests`, `role`, `busy`). Plain data.
//  - **`drafts` + `onDraft`**. The half-typed form fields an operator is in
//    the middle of editing. One patch channel rather than a setter per field,
//    because a panel with eight inputs would otherwise need eight callbacks
//    that all do the same thing, and the eighth is the one somebody forgets.
//  - **`api`, `run`, `confirmThen`**. The page's effect primitives.
//
// That last group is a trade-off worth stating rather than hiding. Naming every
// action individually (`onSetRole`, `onDeleteUser`, …) would document precisely
// what each panel can do, and would mean roughly twenty hand-written callbacks
// for this file alone, each one a place to wire the wrong thing. Passing the
// three primitives instead keeps the call sites explicit *inside* the panel,
// where they read as ordinary code, at the cost of the props no longer being an
// exhaustive capability list. The tests still work either way: a panel can be
// rendered against a stub `api`, which is the property that mattered most.
//
// `confirmThen` in particular stays a primitive rather than becoming
// per-action callbacks, because the *wording* of a confirmation is presentation
//, it names the account and the change in the operator's language, while
// *showing a dialog and running the action* is the page's job. Splitting it
// that way keeps the sentence an operator reads next to the markup it belongs
// to.
import { html, nothing, type ReactiveControllerHost, type TemplateResult } from "lit";
import type { GovernanceRole } from "../../../../../src/governance/roles.ts";
import {
  renderSettingsRow,
  renderSettingsSection,
  renderSettingsSegmented,
  renderSettingsStatus,
  renderSettingsValue,
} from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import type { GovernanceApi, GovernanceIdentity, GovernanceUserRecord } from "../api.ts";
import {
  deleteAccountAndReport,
  renderAccountDeletionNotice,
  type AccountDeletionNotice,
} from "./account-deletion.ts";
import { renderAnswersToControl } from "./account-manager-control.ts";
import { renderManagedAccountsSection } from "./managed-accounts-panel.ts";
// The queue moved to its own module on 2026-10-07 (the decision note took this file past
// its 700-line limit); re-exported so every importer keeps working.
export { renderRuleRequestsSection, type RuleRequestsPanelProps } from "./rule-requests-panel.ts";

/**
 * Roles an account can actually be given.
 *
 * **`root` is deliberately absent.** There is exactly one Root per
 * installation, permanently: the server refuses a second on both routes,
 * creating one outright and promoting an existing account, and Root cannot be
 * demoted either. Offering it in a picker produced a control whose only
 * possible outcome was the error "A Root account already exists; there can be
 * only one", which is what driving the page by hand actually produced.
 *
 * The page already applies this principle elsewhere, a core rule shows no
 * Remove button, because the server would refuse it, and this is the same
 * rule applied to the account tier.
 */
const ASSIGNABLE_ROLE_OPTIONS: ReadonlyArray<{ value: GovernanceRole; label: string }> = [
  { value: "viewer", label: "viewer" },
  { value: "user", label: "user" },
  { value: "administrator", label: "administrator" },
];

/**
 * Which Administrator would answer for this account if it were demoted into a
 * managed tier, or `undefined` if none could.
 *
 * **The server has required this since the store gained its `managedBy`
 * parameter, and this control never sent one** (finding 197). Every demotion of
 * an Administrator to User or Viewer therefore reached `MissingManagerError`
 * and came back as a 500: the store closed a dead end ("an Administrator could
 * never be demoted at all") and the dead end moved to the surface instead of
 * closing.
 *
 * An account that already has a manager keeps it, so switching a User to a
 * Viewer is unchanged. Only an Administrator being demoted needs a successor
 * chosen, and the first other Administrator is chosen rather than prompted for:
 * the alternative is another control on the busiest row of the page, and the
 * choice is visible in the confirmation and changeable afterwards with the row's
 * "Administrator this account answers to" picker (finding 383; before it, no such
 * field existed and this sentence was untrue).
 */
function successorFor(
  user: GovernanceUserRecord,
  props: AccountsPanelProps,
): GovernanceUserRecord | undefined {
  return props.administrators.find((candidate) => candidate.id !== user.id);
}

/**
 * The Administrator currently answerable for an account, if it has one.
 *
 * Distinct from `successorFor`, and the difference is the whole of one defect:
 * `successorFor` answers *who could take this on*, which is a candidate, while
 * this answers *who has it now*. The role dialog was built from the first when
 * it meant the second, and named a different person than it went on to assign.
 */
function managerOf(
  user: GovernanceUserRecord,
  props: AccountsPanelProps,
): GovernanceUserRecord | undefined {
  return user.managedBy
    ? props.users.find((candidate) => candidate.id === user.managedBy)
    : undefined;
}

/**
 * Who will be answerable for this account **after** a role change, or nobody.
 *
 * Exported so the test suite can assert it directly, and written as one function
 * because it had been two expressions that disagreed — see the call site for
 * what that cost. Both the sentence in the confirmation and the `managedBy` sent
 * to the server read this, so they cannot drift again.
 *
 * `undefined` for Root and Administrator: those answer to the group, and the
 * server is sent no manager for them.
 */
export function managerForRoleChange(
  user: GovernanceUserRecord,
  role: GovernanceRole,
  props: AccountsPanelProps,
): GovernanceUserRecord | undefined {
  if (role !== "user" && role !== "viewer") {
    return undefined;
  }
  // Keep the Administrator this account already answers to. Only when it has
  // none — it is being demoted from Administrator — does a successor apply.
  return managerOf(user, props) ?? successorFor(user, props);
}

/**
 * The roles this account may actually be given.
 *
 * Narrowed for the same reason `root` is absent from the list entirely: the
 * page does not offer a control whose only possible outcome is a refusal. An
 * Administrator with nobody else to answer for them cannot become a User or a
 * Viewer, so those options are withheld rather than shown and rejected.
 */
function roleOptionsFor(
  user: GovernanceUserRecord,
  props: AccountsPanelProps,
): ReadonlyArray<{ value: GovernanceRole; label: string }> {
  if (user.role !== "administrator" || successorFor(user, props)) {
    return ASSIGNABLE_ROLE_OPTIONS;
  }
  // **This second branch stopped being reachable on 2026-09-08**, and is kept
  // rather than deleted. The caller now renders a sentence for the sole
  // Administrator instead of a one-option control, so the narrowing never
  // happens — but the narrowing is the *rule* and the sentence is the way it is
  // presented, and a future caller that goes back to rendering the control
  // should inherit the rule rather than have to rediscover it. Said out loud
  // because an unreachable branch that looks live is its own defect.
  return ASSIGNABLE_ROLE_OPTIONS.filter((option) => option.value === "administrator");
}

/**
 * Shortest password the server will accept.
 *
 * Mirrored by hand from `MIN_PASSWORD_LENGTH` in `src/governance/user-store.ts`,
 * like every type in `api.ts`. The dashboard bundle deliberately does not
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
  /**
   * The whole draft bundle rather than the one field it reads.
   *
   * So a caller can hand it `...controller.slice()` and be done, instead of
   * naming `passwordEdits` and `onDraft` separately, two lines that have to
   * agree about which controller they came from, at a call site that already
   * spreads two other bundles.
   */
  drafts: AccountDrafts;
  onDraft: (patch: Partial<AccountDrafts>) => void;
  onError: (message: string) => void;
};

/**
 * Form state an operator is part-way through typing, owned by
 * `AccountsController` below and read by the panels.
 *
 * **It used to be six `@state` fields on the page**, and moving it here was not
 * tidying: `governance-page.ts` sits against a 700-line limit the project set
 * itself, it was at exactly 700, and the organisation panel could not be added
 * to it at all. The registry panel had already established the answer (M6),
 * a panel owns its own drafts, and these were the last set that had not
 * followed. The page keeps what the page is for: identity, server data,
 * lifecycle.
 */
export type AccountDrafts = {
  agentEdits: Record<string, string>;
  passwordEdits: Record<string, string>;
  newUserName: string;
  newUserPassword: string;
  newUserRole: GovernanceRole;
  newUserManagedBy: string;
  /**
   * The Root username as typed into the organisation-deletion field.
   *
   * Here rather than in a controller of its own because it is the same subject
   *Root administering accounts, and because two controllers on one page
   * both exposing `onDraft` is the collision the registry panel's `slice()`
   * warns about, one page further along.
   */
  orgConfirmName: string;
  /** The outcome of the last organisation deletion, kept until the next action. */
  orgNotice: string;
  /** A deleted account that left something to finish (T76), until it is finished. */
  deletionNotice: AccountDeletionNotice | null;
  /**
   * The account whose password was just set, so its row says so (QA of 2026-10-07: the
   * field only emptied, and a set password looked like a press that did nothing).
   */
  passwordSetFor: string;
};

export function emptyAccountDrafts(): AccountDrafts {
  return {
    agentEdits: {},
    passwordEdits: {},
    newUserName: "",
    newUserPassword: "",
    newUserRole: "viewer",
    newUserManagedBy: "",
    orgConfirmName: "",
    orgNotice: "",
    deletionNotice: null,
    passwordSetFor: "",
  };
}

/**
 * The account panels' draft state, held off the page.
 *
 * The shape `AgentRegistryController` set, including the warning on `slice()`:
 * spread it **last** into a merged props bundle, because `onDraft` is a name
 * more than one panel uses.
 */
export class AccountsController {
  private drafts: AccountDrafts = emptyAccountDrafts();

  constructor(private readonly host: ReactiveControllerHost) {
    host.addController(this);
  }

  /** Required by `ReactiveController`; this controller has no connect-time work. */
  hostConnected(): void {}

  slice(): { drafts: AccountDrafts; onDraft: (patch: Partial<AccountDrafts>) => void } {
    return {
      drafts: this.drafts,
      onDraft: (patch) => {
        // Replaced rather than mutated, then the host is told, Lit re-renders
        // on identity change.
        this.drafts = { ...this.drafts, ...patch };
        this.host.requestUpdate();
      },
    };
  }

  /**
   * Drops the drafted secrets when a session ends.
   *
   * The page called this inline when it owned the field, with a comment
   * explaining that a half-typed password is the one piece of ended-session
   * state that is *secret* rather than merely stale. That reasoning moves with
   * the field: the owner of the state is the right place to know which part of
   * it must not outlive a session.
   */
  reset(): void {
    // All of it, not only the secrets (finding 392). This used to clear the per-row
    // passwords and the organisation confirmation and keep the rest, which kept the
    // half-typed new account, its password included, for the next account signed in.
    // `orgNotice` is handed to the page before the sign-out, so nothing is lost here.
    this.drafts = emptyAccountDrafts();
    this.host.requestUpdate();
  }
}

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
   * characterization tests written before this extraction. The whole reason
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
  /**
   * No separate `role` prop, unlike the rule-request panel beside it.
   *
   * It carried the same fact as `identity.role` and the page had to keep the
   * two in step by passing both. One fact, two props, is the shape this project
   * keeps finding defects in; the tier is read off the identity that already
   * has to be here for the self-deletion check.
   */
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
  /** The agents this page holds, so an Administrator's section can offer its own (finding 397). */
  agents?: readonly { agentId: string; registered?: boolean; adminUsername?: string }[];
};

/**
 * The accounts this tier may see: Root's whole list, an Administrator's own Users and
 * Viewers (finding 397), and nothing below. Asking as a lower tier would 403 and spoil
 * an otherwise successful refresh.
 */
export function accountsInReach(
  api: GovernanceApi,
  identity: GovernanceIdentity | null,
): Promise<GovernanceUserRecord[]> {
  if (identity?.role === "root") {
    return api.listUsers();
  }
  return identity?.role === "administrator" ? api.listManagedAccounts() : Promise.resolve([]);
}

/** Saves one account's typed agent list; the button and Enter in the box share it. */
function saveAgents(user: GovernanceUserRecord, props: AccountsPanelProps) {
  return props.run(async () => {
    const raw = props.drafts.agentEdits[user.id] ?? user.assignedAgents.join(", ");
    await props.api().setUserAgents(
      user.id,
      raw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    );
    const { [user.id]: _cleared, ...rest } = props.drafts.agentEdits;
    props.onDraft({ agentEdits: rest });
  });
}

export function renderUsersSection(props: AccountsPanelProps): TemplateResult | typeof nothing {
  // Account administration is the Root tier's defining responsibility: the
  // design doc gives Root the human side of the system and Administrator the
  // agent side, so this section is hidden below Root entirely.
  if (props.identity?.role === "administrator") {
    // An Administrator reaches only its own Users and Viewers (finding 397); the page
    // loads exactly those into `users` for this tier.
    return renderManagedAccountsSection({
      ...props,
      accounts: props.users,
      ownedAgentIds: (props.agents ?? [])
        .filter((agent) => agent.registered && agent.adminUsername === props.identity?.username)
        .map((agent) => agent.agentId),
      reload: props.reloadUsers,
    });
  }
  if (props.identity?.role !== "root") {
    return nothing;
  }
  const deletion = {
    ...props,
    notice: props.drafts.deletionNotice,
    setNotice: (deletionNotice: AccountDeletionNotice | null) => props.onDraft({ deletionNotice }),
  };
  return renderSettingsSection({ title: t("governance.users.title") }, [
    renderAccountDeletionNotice(deletion),
    ...props.users.map((user) =>
      renderSettingsRow({
        title: user.username,
        // **Who is answerable for this account, on the row** (added 2026-09-08).
        // Every User and Viewer has exactly one Administrator over them: it is
        // the invariant M3 exists for, the create form makes Root choose it,
        // deleting an Administrator is refused because of it, and the role
        // dialog names it. This list — the one place Root reads the whole
        // organisation — was the only surface that never showed it, so the
        // management tree could be set but not audited. Absent for Root and
        // Administrator, which answer to the group rather than to a person.
        description: [
          `${t("governance.users.created")} ${new Date(user.createdAt).toLocaleDateString()}`,
          managerOf(user, props)
            ? t("governance.users.answersTo", { username: managerOf(user, props)?.username ?? "" })
            : "",
          // **The permission, beside the button that changes it.** The button
          // names the *action* — "Withhold rule editing" / "Allow rule editing"
          // — and a permission control labelled with its action is ambiguous in
          // both directions: "Allow rule editing" reads equally as *this account
          // may* and as *click to let it*. Nothing else on the row resolved it,
          // so whether a User could write policy was invisible unless you
          // hovered for the tooltip. User tier only, because the flag is inert
          // above it and absent below.
          // `canAuthorPolicy === false` rather than a helper: absent means
          // allowed, and the dashboard bundle does not import from `src/` —
          // the same reason `MIN_PASSWORD_LENGTH` is mirrored by hand above.
          // This is the test the button below already uses.
          user.role === "user"
            ? user.canAuthorPolicy === false
              ? t("governance.users.policyAuthoringStateWithheld")
              : t("governance.users.policyAuthoringState")
            : "",
        ]
          .filter(Boolean)
          .join(" · "),
        stacked: true,
        control: html`
          <div class="settings-row__control" style="gap:0.5rem;flex-wrap:wrap">
            ${user.role === "root"
              ? // Root is permanent: it cannot be demoted, and no second Root
                // can be created or promoted. So this row states the role
                // rather than offering a control that would only ever be
                // refused, and says *why*, because "the buttons are missing"
                // is otherwise indistinguishable from a page that failed to
                // render.
                renderSettingsValue(t("governance.users.rootPermanent"))
              : user.role === "administrator" && !successorFor(user, props)
                ? // **The same courtesy the Root row above gets.** A sole
                  // Administrator cannot become a User or a Viewer, because
                  // nobody would be left to answer for them, so
                  // `roleOptionsFor` narrows the control to its current value
                  // — deliberately, and until now silently. A segmented
                  // control showing exactly one option is indistinguishable
                  // from a page that failed to draw the other two, which is
                  // the reason `rootPermanent` states its own case rather
                  // than just omitting the buttons.
                  renderSettingsValue(t("governance.users.soleAdministrator"))
                : renderSettingsSegmented({
                    value: user.role,
                    disabled: props.busy,
                    // Named per row (QA of 2026-10-07): unnamed, every row read the same.
                    ariaLabel: t("governance.users.roleFor", { username: user.username }),
                    options: roleOptionsFor(user, props),
                    // A privilege change used to apply the instant the control
                    // was clicked, including a mis-click onto a higher tier. It
                    // is the most consequential control on the page and had the
                    // lightest interaction of any of them.
                    onChange: (role) => {
                      // **One resolution, read by the sentence and by the call.**
                      // They were two expressions and they disagreed, in both
                      // directions (2026-09-08):
                      //
                      //   - The sentence appended "will answer to X" whenever
                      //     *any* other Administrator existed, including when the
                      //     target role was `administrator` — which answers to
                      //     the group and is sent `managedBy: undefined`.
                      //     Measured: promoting a User to Administrator said
                      //     "(will answer to malek)" and produced `managedBy:
                      //     (none)`.
                      //   - Where a manager *was* sent, the sentence showed
                      //     `successorFor(...)` — the first other Administrator —
                      //     while the call sent `user.managedBy ?? successor`.
                      //     For an account that already had one, those are
                      //     different people. Measured: a Viewer answering to
                      //     haitham was changed to User under a dialog reading
                      //     "(will answer to malek)", and kept haitham.
                      //
                      // A confirmation that misstates the consequence is worse
                      // than none, and this is the control whose comment above
                      // calls it the most consequential on the page. Finding
                      // 278's class, in the last thing shown before the act.
                      const manager = managerForRoleChange(user, role as GovernanceRole, props);
                      void props.confirmThen(
                        {
                          message: t("governance.confirm.changeRole"),
                          details: `${user.username}: ${user.role} → ${role}${
                            manager
                              ? ` (${t("governance.users.willAnswerTo", {
                                  username: manager.username,
                                })})`
                              : ""
                          }`,
                          confirmLabel: t("governance.confirm.changeRoleAction"),
                          danger: role === "administrator",
                        },
                        () => props.api().setUserRole(user.id, role as GovernanceRole, manager?.id),
                      );
                    },
                  })}
            ${renderAnswersToControl(user, props)}
            ${user.role === "user" || user.role === "viewer"
              ? html`<input
                    class="input"
                    type="text"
                    style="max-width:14rem"
                    aria-label=${t("governance.users.agentsLabel", { username: user.username })}
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
                    @keydown=${(e: KeyboardEvent) => {
                      // Not while an input method is composing, nor on a held key's repeats.
                      if (e.key === "Enter" && !e.isComposing && !e.repeat && !props.busy) {
                        void saveAgents(user, props);
                      }
                    }}
                  />
                  <button
                    class="btn"
                    ?disabled=${props.busy}
                    @click=${() => saveAgents(user, props)}
                  >
                    ${t("governance.users.saveAgents")}
                  </button>`
              : nothing}
            ${
              // Root decides how much of the §3.7 User expansion this account
              // actually gets. Offered on the User tier only, because the
              // flag is inert above it and a control that does nothing is a
              // control that misleads. The shape of finding 100.
              //
              // Withholding removes *writing policy*, not the tier: the
              // account keeps reading its agents' policy and ledger,
              // prompting them, stopping them, and submitting rule requests.
              props.identity?.role === "root" && user.role === "user"
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
              parameters became upgradeable, and no surface ever called it,
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
                  passwordSetFor: "",
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
            ${props.drafts.passwordSetFor === user.id
              ? renderSettingsStatus({ kind: "ok", label: t("governance.users.passwordSet") })
              : nothing}
            <button
              class="btn danger"
              ?disabled=${props.busy || user.username === props.identity?.username}
              title=${user.username === props.identity?.username
                ? // Names the act that *does* remove this account rather than
                  // stopping at "no". Deleting Root on its own is refused
                  // because it strands everybody below; deleting the
                  // organisation takes everybody below with it, and is the
                  // panel immediately underneath this one.
                  // **A full stop between them, because they are two
                  // sentences.** Joined with a bare space this read "…the
                  // account you are signed in with To remove your own Root
                  // account…", which is the one string an operator only ever
                  // meets as a tooltip, at the moment they are wondering why a
                  // button is dead. The strings stay separate — the first is
                  // the refusal and the second is the way round it, and other
                  // callers may want only one — so the separator belongs here.
                  `${t("governance.users.cannotDeleteSelf")}. ${t("governance.users.cannotDeleteSelfHint")}`
                : ""}
              @click=${() =>
                props.confirmThen(
                  {
                    message: t("governance.confirm.deleteUser"),
                    details: user.username,
                    confirmLabel: t("governance.users.delete"),
                  },
                  () => deleteAccountAndReport(deletion, user.id),
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
              // Administrator first. Possibly one they sign into themselves.
              html`<span class="settings-hint">${t("governance.users.noAdministrators")}</span>`
            : nothing}
          ${
            // **The ordinary case, which was the one left unexplained.** The
            // branch above covers "there are no Administrators at all" and says
            // what to do about it. When Administrators exist and none has been
            // picked, the Create button is simply disabled with nothing said —
            // no hint, no title, no `aria-disabled` — and the only clue is the
            // select's own placeholder. The harder case was explained and the
            // common one was not.
            (props.drafts.newUserRole === "user" || props.drafts.newUserRole === "viewer") &&
            props.administrators.length > 0 &&
            !props.drafts.newUserManagedBy
              ? html`<span class="settings-hint"
                  >${t("governance.users.chooseAdministrator")}</span
                >`
              : nothing
          }
          <button
            class="btn primary"
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
 *      control is the only way to change it: which is exactly why it is
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
  const password = (ctx.drafts.passwordEdits[userId] ?? "").trim();
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
      ctx.onDraft({
        passwordEdits: { ...ctx.drafts.passwordEdits, [userId]: "" },
        passwordSetFor: userId,
      });
    },
  );
}
