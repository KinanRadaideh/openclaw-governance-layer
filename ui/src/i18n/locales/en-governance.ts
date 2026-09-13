// The governance dashboard's operator-facing text, loaded with the page.
//
// **Split out of `en.ts` on 2026-09-09, decision T64.** These are ~32 KB of
// English strings, 10.5 KB gzipped, and they were being loaded at startup by
// every session because the English catalog was a single module. The page they
// belong to is lazy, and most operators never open it.
//
// **How it reaches the running page.** `pages/governance/governance-page.ts`
// imports this module directly, so it lands in that page's chunk and is
// registered into the English catalog when the chunk evaluates — before the
// element renders, so no sentence is ever briefly missing. See
// `registerLocaleStrings` in `lib/translate.ts`.
//
// **What must stay true.** Everything here hangs off the single top-level
// `governance` key. Registration merges at the top level, so a page that
// scattered its strings across keys the core also uses would silently replace
// them. One page, one namespace.
//
// The twenty translated locales are unaffected: each is one lazily-imported
// module holding every key, `governance.*` included, and `en.ts` still merges
// this back in for the translation pipeline.
import type { TranslationMap } from "../lib/types.ts";

export const enGovernance: TranslationMap = {
  governance: {
    /**
     * The deployment and network report (A7).
     *
     * **These strings lived under `quickSettings` until 2026-08-31 and nothing
     * ever read them there.** `oversight-panels.ts` looks them up as
     * `governance.deployment.*`, so every one of the panel's fifteen lookups
     * fell through to its own key and the Root-only report rendered as
     * `GOVERNANCE.DEPLOYMENT.TITLE` above a column of
     * `governance.deployment.status.pass`.
     *
     * Found by T38. Opening the page, and by nothing else. A component test
     * cannot see it: `t()` returning the key is a perfectly good string, so the
     * panel renders, the assertions about *which checks appear* still pass, and
     * only a reader notices that none of it is English. The raw-copy verifier
     * cannot see it either; it looks for hard-coded strings, which is the
     * opposite mistake.
     */
    deployment: {
      title: "Deployment and network posture",
      hint: "How this installation is deployed, checked against the architecture the design specifies. Read-only. These are changed in the gateway configuration on the host, not from here.",
      summary: "Overall",
      counts: "{fail} failed · {warn} warnings · {unknown} not determined here · {pass} passed",
      note: "note",
      status: {
        pass: "pass",
        warn: "warn",
        fail: "fail",
        unknown: "not determined here",
      },
      facts: {
        gateway: "Gateway",
        dir: "Governance directory",
        relocated: "Relocated by OPENCLAW_GOVERNANCE_DIR.",
      },
    },
    title: "Governance",
    intro:
      "Default-deny policy for autonomous agent actions, a tamper-evident audit ledger, and an emergency kill switch.",
    nav: {
      sections: "Sections",
    },
    loading: "Loading governance state…",
    login: {
      title: "Sign in to Governance",
      hint: "Governance uses its own named accounts and roles, separate from the Gateway credential.",
      sessionExpired:
        "Your session ended, so the page was cleared rather than left showing out-of-date information. Sign in again to continue.",
      bootstrapTitle: "Create the Root account",
      bootstrapHint:
        "No governance account exists yet. The first account created becomes Root, the system owner. " +
        "Root is permanent and its password cannot be reset from here. If you lose it, the only way back in is to delete the accounts file on the server. Store it somewhere safe before continuing.",
      username: "Username",
      password: "Password",
      confirmPassword: "Confirm password",
      passwordMismatch: "The two passwords do not match.",
      passwordTooShort: "Password must be at least {min} characters.",
      signIn: "Sign in",
      createRoot: "Create Root account",
    },
    identity: {
      title: "Identity",
      signedInAs: "Signed in as",
      signOut: "End this governance session",
      signOutButton: "Sign out",
      // What the signed-in tier may actually do, said on the one panel whose
      // subject is "who am I". Without it the role is a bare lowercase token
      // and the rest of the page is the only clue: a Viewer sees far fewer
      // sections than a Root and nothing says why, which reads as a page that
      // failed to load rather than as a tier doing its job.
      canDoLabel: "What this account can do",
      canDoRoot:
        "Root. You own this organisation and manage its people: create accounts, set roles, and delegate agents to Administrators. You can do anything an Administrator can as well.",
      canDoAdministrator:
        "Administrator. You manage agents: register them, write their rules, stop them, and answer escalations. Root manages the accounts.",
      // Two Users, two different accounts. `canAuthorPolicy` is on the
      // identity, so this panel can say which one you are rather than
      // describing the tier and leaving you to work it out — the same
      // ambiguity the Accounts row carried until the state was printed
      // beside the button that changes it.
      canDoUser:
        "User. You operate the agents assigned to you: prompt them, stop them, read their audit trail, and write their rules.",
      canDoUserWithheld:
        "User. You operate the agents assigned to you: prompt them, stop them, and read their audit trail. Root has withheld rule editing from this account, so to change a rule you request it and an Administrator approves.",
      // **The masking promise was wider than the masking** (finding 331,
      // decided by Kinan 2026-09-09). The ledger does mask a Viewer's
      // resource details — `[redacted for viewer role]` — and one section
      // down, Rule requests shows that same Viewer the full pattern and the
      // requester's reason. Both are deliberate: reading the queue is
      // oversight, which is the tier's job, and narrowing it would remove a
      // capability to keep a sentence true. So the sentence is what changes.
      // It now says where masking applies rather than implying it is
      // everywhere, which is the honest version of the same promise.
      canDoViewer:
        "Viewer. You can read the audit trail for the agents assigned to you, with resource details masked there, and you can read the rule requests queue in full. You cannot change anything or prompt an agent.",
    },
    policy: {
      title: "Policy",
      loading: "Loading policy…",
      mode: "Posture",
      modeHint:
        "Enforce blocks or asks on unlisted actions. Monitor records decisions without blocking. Off disables the gate.",
      confirmOff: "Switch governance off for every agent?",
      confirmOffDetails:
        "Nothing will be checked, blocked, or recorded, including the core denials on credentials and the governance directory, and including the kill switch. This applies to every agent in the installation, not just one. To observe without blocking, choose Monitor instead.",
      confirmOffAction: "Switch governance off",
      modeEnforce: "Enforce",
      modeMonitor: "Monitor",
      modeOff: "Off",
      ask: "On an unlisted action",
      askHint:
        "Ask on miss pauses and requests human approval. Off denies outright (strict default-deny).",
      askOnMiss: "Ask a human",
      askOff: "Deny",
      noRules: "No allow rules yet",
      noRulesHint: "With no rules, every governed action is unlisted and will be denied or asked.",
      noMatchingRules: "No rules match this filter",
      noMatchingRulesHint:
        "The policy is not empty. This filter matches none of it. Clear the filter to see everything.",
      filterTitle: "Find a rule",
      filterCount: "Showing {matching} of {total} rules",
      filterSearchLabel: "Search rules",
      filterSearchPlaceholder: "Pattern, description or agent…",
      filterKind: "Filter by kind",
      filterAnyKind: "any kind",
      filterTier: "Filter by tier",
      filterAnyTier: "any tier",
      filterEffect: "Filter by effect",
      filterAnyEffect: "allow or forbid",
      filterScope: "Filter by scope",
      filterAnyScope: "any scope",
      filterClear: "Clear",
      addRule: "Add a rule",
      addRuleButton: "Add rule",
      folderGrantTitle: "Allow a folder, except…",
      folderGrantHint:
        "Writes the allow rule and the deny rules for you. Everything it creates appears below as ordinary rules you can edit or remove one at a time.",
      folderGrantFolderLabel: "Folder to allow",
      folderGrantFolderPlaceholder: "e.g. src: the agent may read and write everything below it",
      folderGrantExceptionsLabel: "Paths inside it that stay forbidden",
      folderGrantExceptionsPlaceholder:
        "One per line, e.g. src/secrets. Leave empty to allow the whole folder",
      folderGrantAgentLabel: "Agent",
      folderGrantAgentPlaceholder: "Agent id, or leave empty for every agent (Administrator only)",
      folderGrantButton: "Allow folder",
      folderGrantWrote: "Written as separate rules:",
      codexSearchCaveat:
        "On the Codex engine a search can still return this path; opening it directly is refused there as it is everywhere.",
      folderGrantExplainTitle: "What this does, and how it differs from search protection",
      removeRule: "Remove",
      whichAgents: "Who does this affect?",
      coreRuleDisable: "Switch off",
      coreRuleHint:
        "Stop enforcing this shipped denial. It stays declared and can be switched back on. The deployment report will report the installation as failing while it is off.",
      coreRuleLocked: "Cannot be switched off",
      coreTierTitle: "Why some built-in rules have no Switch off",
      coreTierHint:
        "The built-in denials come in two kinds. Most are ordinary security opinions, and Root can switch those off. The rest are what stop a governed agent reaching the policy, the accounts, the audit ledger and the signing key that makes the ledger tamper-evident — switching one off would let an agent grant itself permissions and then erase the record of having done so. The server refuses that for every account, Root included, so those rows say “Cannot be switched off” instead of offering a button that could not work.",
      agentRequiredPlaceholder: "Agent id (required)",
      agentRequiredHint:
        "Pick one of your agents. Only an Administrator can write a rule that binds every agent.",
      bindsOne: "Binds one agent: {agent}",
      bindsAll: "Global. Binds every agent, including ones not created yet.",
      bindsKnown: "Currently known: {agents}.",
      bindsNoneKnown: "No agents known yet.",
      bindsScoped: "(narrowed to the agents you manage)",
      patternPlaceholder: "Regular expression, e.g. ^ls( .*)?$",
      // Accessible names for controls that previously relied on their
      // placeholder. A placeholder is not a label: it is not reliably exposed
      // as an accessible name and it disappears once the field has content, so
      // the hint vanishes exactly when somebody reviewing what they typed needs
      // it. The sign-in form already said this in a comment; the rest of the
      // page did not follow it.
      kindLabel: "Resource kind",
      patternLabel: "Rule pattern",
      ruleAgentLabel: "Agent this rule applies to",
      ttlLabel: "Rule lifetime in minutes",
      agentPlaceholder: "Agent id (blank = all agents)",
      globalScope: "all agents",
      agentOverride: "Agent override",
      agentOverrideHint: "This agent ignores the installation default above.",
      agentHitlTimeout: "Approval timeout for one agent",
      agentHitlTimeoutHint:
        "Overrides the installation timeout for a single agent. An Administrator sets it for any agent in the organisation; a User sets it for the agents assigned to them. Between 5 seconds and 24 hours.",
      agentHitlTimeoutAgent: "Agent id",
      agentHitlTimeoutSeconds: "Seconds",
      agentHitlTimeoutSave: "Set for this agent",
      hitlTimeout: "Approval timeout",
      hitlTimeoutHint:
        "How long an escalation waits for a human before it times out. The value is in seconds: 300 is five minutes. Between 5 (five seconds) and 86400 (24 hours). Administrator and above.",
      hitlTimeoutSave: "Set timeout",
      userAsk: "Account override",
      userAskHint:
        "Override the approval setting above for one account. Root only. Clear returns the account to the default.",
      userAskAccount: "Account name",
      userAskClear: "Clear override",
      userOverride: "Account override",
      userOverrideHint: "This account ignores the installation default above.",
      userOverrideUnknown:
        "No account of this name exists in this group. Check the spelling, or this override will do nothing until somebody with that name is created.",
      clearOverride: "Use default",
      agentPosture: "Agent posture",
      agentPostureOff:
        "Governance is switched off for this agent. The kill switch and built-in restrictions do not apply. Set from policy.json by hand; the dashboard will not do this.",
      agentPostureHint: "This agent ignores the installation posture above.",
      observeAgent: "Observe one agent",
      observeAgentHint:
        "Monitor records what the policy would have decided without acting on it, for one agent, so rules can be discovered from real behaviour. Core denials and the kill switch still apply.",
      ttlPlaceholder: "Minutes (blank = never expires)",
      ttlHint: "Leave blank for an indefinite rule that never expires.",
      indefinite: "never expires",
      conflictTitle: "Rule added, but an earlier rule already covers it",
      overriddenTitle: "Rule added, but a deny rule overrides it. It will never take effect",
      warningTitle: "This rule is broader than it looks",
      denyBadge: "DENY",
      effectLabel: "Allow or forbid",
      effectAllow: "allow",
      effectDeny: "forbid",
      effectHint:
        "A forbid rule is checked before every allow rule and cannot be overridden by one. Use it for something the agent must never do, whatever else permits it.",
      evaluationTitle: "How these rules are read",
      evaluationHint:
        "Forbid beats allow, always. Every forbid rule is checked first, whatever tier it belongs to, so a narrow forbid carves an exception out of a broad allow. Grant a folder, forbid one subfolder inside it, and the subfolder stays out of reach. Order in this list does not decide anything; effect does.",
      searchCaveatTitle: "Where a forbid rule reaches, and where it only records",
      searchCaveatHint:
        "A forbid rule stops a file being opened. Searches are different: grep and find are judged on the folder they start from, then read everything beneath it, so a search rooted above a forbidden path reaches that path. On the built-in runtime those results are now removed before the agent sees them, and the agent is told how many were withheld. On the Codex backend they cannot be removed, because its protocol has no way to return a corrected result. There the reach is written to the audit trail and not prevented. An agent is only on that backend if an administrator has permitted it, and each agent's permission is shown in the agent list.",
      accessLabel: "Read or write",
      accessBoth: "read + write",
      accessRead: "read only",
      accessWrite: "write only",
      accessHint: "Narrows a path rule to one direction. Leave as read + write to cover both.",
      readOnlyBadge: "read",
      writeOnlyBadge: "write",
      immutable: "built-in",
      tierCore: "core (built-in, cannot be removed)",
      tierBaseline: "baseline (shipped default)",
      tierAdmin: "added by an operator",
      conflictDismiss: "Got it",
      expiresIn: "expires in",
      expired: "expired",
    },
    /**
     * Rule display, shared by the panels that list rules.
     *
     * **This block did not exist until 2026-09-01**, so
     * `governance.rules.expires` resolved to nothing and an expiring rule read
     * `path · ^/srv/… · governance.rules.expires 2026-09-10T…` on the one panel
     * an operator opens to find out why an agent is blocked.
     */
    rules: {
      expires: "expires",
    },
    agentPolicy: {
      access: "Who can reach this agent",
      accessHint:
        "Accounts given this agent by assignment. Administrators and Root reach every agent by role and are not listed.",
      accessNobody: "Nobody. No User or Viewer has been assigned this agent.",
      accessUnknown: "Could not load who has access.",
      title: "Agent permissions",
      hint: "Every rule in force for one agent. The global rules that bind every agent, plus any written for this one. This is what the gate consults, not just what the document lists.",
      pick: "Agent",
      pickHint: "Pick an agent you manage, or type its id.",
      // **A Viewer manages nothing** (2026-09-08). The hint above is
      // unconditional, so the one tier that can only read was told to pick
      // an agent it "manages" — the same falsehood, one panel over, as the
      // conversation picker telling an unassigned User they manage every
      // agent. This panel is genuinely useful to a Viewer: reading what is
      // in force is exactly their job.
      pickHintReadOnly:
        "Pick an agent assigned to you, or type its id. You can read the rules in force for it, not change them.",
      // The answer below is real but may be about nobody: global rules bind
      // every agent, so a mistyped id returns a full, confident page. The kill
      // switch already says this for the same free-text field.
      unknownAgent:
        "No agent with this id is registered, running, or assigned to an account. What follows is what would bind it if one existed; check the id if you meant an agent that is already there.",
      show: "Show permissions",
      posture: "Posture",
      escalation: "Ask a human on a miss",
      override: "Set for this agent",
      inherited: "Installation default",
      locked: "Emergency stop",
      summary: "Rules in force",
      counts:
        "{total} total, {global} global, {scoped} for this agent; {allows} allow, {denies} forbid",
      none: "No rules are in force for this agent. Under default-deny it can do nothing.",
      viaGlobal: "global",
      viaAgent: "this agent",
      failed: "Could not load this agent's permissions.",
    },
    ledger: {
      title: "Audit ledger",
      intent: "Agent said",
      verify: "Verify chain integrity",
      integrity: "Chain integrity",
      integrityHow:
        "Every entry is hashed with this installation's signing key, and each one carries the hash of the entry before it. Verifying recomputes all of them and compares each link, then checks the total against a separate checkpoint file so that entries deleted from the end are detected too.",
      integrityEvidence:
        "Checked {count} entries, ending at #{headSeq}. Chain head {headHash}. Checkpoint agrees at #{checkpointSeq}. Entries are signed with this installation's key.",
      integrityEvidenceNoCheckpoint:
        "Checked {count} entries, ending at #{headSeq}. Chain head {headHash}.",
      integrityRecheck:
        "Run {command} at the terminal to recompute this independently of the dashboard; the chain head above should match.",
      kindColumn: "Kind",
      intact: "Intact, entries verified",
      tampered: "TAMPERED at entry",
      // Said always, not only when something is missing: a count that appears
      // only on truncation is a count nobody learns to look for (T56's rule).
      showing: "Showing the {shown} most recent of {total} entries",
      // Under a filter, {total} counts matches and not the trail.
      showingFiltered:
        "Showing the {shown} most recent of {total} matching, out of {held} entries loaded",
      showingCapped:
        "Older entries are on disk and are not loaded here. Run {command} at the terminal to read the whole chain.",
      // "To show", not "yet": a scoped reader's empty view, or a filter's, is not
      // a ledger with nothing recorded in it (finding 333's shape).
      empty: "No audit entries to show",
      emptyHint: "Entries appear here as governed actions happen on the agents you can see.",
      emptyFiltered: "No loaded entries match this filter",
      by: "by",
      adminBadge: "admin",
      filterAll: "All",
      filterAgent: "Agent actions",
      filterAdmin: "Policy changes",
      filterAuth: "Sign-ins",
    },
    freshness: {
      // Not "the rest of the page is current": when every panel failed, that was
      // the page claiming a freshness it did not have.
      partial: "Some panels could not be reloaded, so what they show may be out of date.",
    },
    confirm: {
      title: "Are you sure?",
      removeRule: "Remove this permission? The agent will no longer be allowed to do this.",
      disableCoreRule:
        "Switch off this shipped protection? It is part of the security floor every installation ships with. It stays declared and can be switched back on, the change is recorded against your account, and the deployment report will report this installation as failing while it is off.",
      setPassword:
        "Set a new password for this account? Every device signed in as this account will be signed out.",
      setOwnPassword:
        "Set a new password for your own Root account? You will be signed out immediately and must sign in again with the new password. Root has no other password recovery. Make sure you have the new one recorded.",
      deleteUser: "Delete this account? This cannot be undone, and there is no password reset.",
      stopAgent: "Stop this agent? Work already running will be interrupted.",
      changeRole: "Change this account's role?",
      changeRoleAction: "Change role",
    },
    users: {
      managedByLabel: "Administrator answerable for this account",
      managedByHint:
        "Every User and Viewer answers to one Administrator, who manages their agents. Root can create an Administrator to run themselves.",
      managedByPlaceholder: "Choose an Administrator…",
      noAdministrators:
        "Create an Administrator first. A User or Viewer must have one answerable for it.",
      title: "Accounts",
      created: "Created",
      add: "Create an account",
      // **All four tiers, since 2026-09-08.** This is the only place on the
      // page that explains the tier model, and it described three of the four
      // — omitting **User**, which is the option immediately below it, the
      // least self-evident of the set, and the only one with a further
      // control (rule editing) attached to it.
      addHint:
        "Root manages people. An Administrator manages agents and answers for the accounts under them. A User operates the agents assigned to it — prompting, stopping, and writing their rules unless you withhold that. A Viewer only reads the audit trail, with resource details masked.",
      addButton: "Create account",
      rootPermanent: "root (permanent, cannot be changed)",
      willAnswerTo: "will answer to {username}",
      // Shown on the account row so Root can read the management tree off
      // the list, rather than only being made to choose it at creation.
      answersTo: "Answers to {username}",
      // Shown when a manager is required and none is picked yet. The
      // no-Administrators-at-all case has always been explained
      // (`noAdministrators`); this, the ordinary case, left a dead button
      // with no reason given.
      chooseAdministrator:
        "Choose the Administrator who will be answerable for this account before creating it.",
      // The sole Administrator cannot be demoted, because nobody would be
      // left to answer for them. Said out loud for the reason `rootPermanent`
      // is: a control with one option looks like a page that failed to draw.
      soleAdministrator:
        "The only Administrator. Create a second one before changing this account's role, so the accounts answering to it still have someone answerable.",
      setPassword: "Set password",
      newPasswordFor: "New password for {username}",
      newUsernameLabel: "New account username",
      newPasswordLabel: "New account password",
      newRoleLabel: "New account role",
      agentsLabel: "Agents assigned to this account",
      delete: "Delete",
      cannotDeleteSelf: "You cannot delete the account you are signed in with",
      passwordPlaceholder: "Password (min 8 characters)",
      agentsPlaceholder: "Assigned agents (comma separated)",
      // **The row states the permission; the button states the action.** The
      // button alone was ambiguous in the way permission toggles always are:
      // "Allow rule editing" reads equally as *this account may* and as
      // *click to let it*, and nothing else on the row said which.
      policyAuthoringState: "May write rules for its agents",
      policyAuthoringStateWithheld: "Cannot write rules — Root withheld it",
      policyAuthoringWithhold: "Withhold rule editing",
      policyAuthoringGrant: "Allow rule editing",
      cannotDeleteSelfHint:
        "To remove your own Root account, delete the organisation below. That removes every account and every agent with it.",
      policyAuthoringHint:
        "Whether this account may change the rules for the agents it manages. Withholding keeps everything else: they can still read the policy and audit log, prompt and stop their agents, and request rule changes for an Administrator to approve.",
      saveAgents: "Save agents",
    },
    organisation: {
      title: "Organisation",
      deleteTitle: "Delete this organisation",
      deleteHint:
        "Removes all {accounts} account(s), including your own Root account, {username}, and every agent in this organisation, from OpenClaw as well as from governance. You will be signed out and there is no way back in: there is no password reset. The audit ledger is kept: it is the record of what happened here and is not an operator's to delete. The next account created on this installation starts a new organisation.",
      confirmLabel: "Type {username} to confirm",
      typeToEnable: "Type {username} exactly to enable this",
      deleteButton: "Delete organisation",
      confirmMessage: "Delete this organisation and everything in it?",
      confirmDetails:
        "Every account and every agent goes, your own Root account included. The agents are deleted from OpenClaw, not just unregistered. This cannot be undone.",
      confirmAction: "Delete everything",
      deleted:
        "Organisation deleted: {accounts} account(s) and {agents} agent(s) removed. Its audit ledger was kept on the server.",
      deletedWithEvidence:
        "Organisation deleted: {accounts} account(s) and {agents} agent(s) removed. Its audit ledger was kept on the server, with {attachments} attachment(s) its entries name.",
      deletedResidue:
        "Organisation deleted, but some files could not be removed and are left on the server: {residue}",
      deletedIncomplete:
        "Organisation deleted: {accounts} account(s) and {agents} agent(s) removed, but some steps after it did not finish, and only you can act on them: {steps}",
    },
    pending: {
      title: "Awaiting your decision",
      shedTitle: "This list is incomplete",
      shed: "This stack has dropped {count} unanswered question(s) to stay under its limit, so it is not a complete list of what is waiting. Every escalation is still in the audit ledger.",
      // "Ended", not "timed out": a wait can also be cancelled before anyone
      // could answer, and this heading sits over both kinds.
      explainer: "These escalations ended before anyone answered",
      // **"tells you to add a rule" was not true until 2026-09-08** (finding
      // 338): nothing followed a decision, the row simply left the list, and
      // the next identical attempt timed out into this same queue. Deciding
      // to allow now files a rule request, which appears in Rule requests
      // below — a proposal an Administrator approves, never a grant taken
      // here, which is the same answer `allow-always` was given.
      explainerHint:
        'The action was denied and the agent moved on. Answering records your judgement, and "Would allow" also files a rule request below, so an Administrator can make the next attempt succeed.',
      agent: "agent",
      timedOut: "timed out",
      // A stopped run, or a surface that could never show the question.
      cancelled: "cancelled",
      allow: "Would allow",
      deny: "Keep denied",
      // T60's dashboard half: the server's own sentence says why and what next.
      proposalNotSaved: "Your answer was recorded. {reason}",
    },
    agents: {
      title: "Agents in your organisation",
      none: "No agents yet",
      noneHint:
        "Create one below. Agents OpenClaw already has appear here too, with a Register button, once this page can see them.",
      ownedBy: "Owned by {owner}",
      unregisteredHint:
        "This agent exists in OpenClaw but is not governed, so every tool call it makes is refused. Register it to bring it under your policy.",
      register: "Register",
      remove: "Remove…",
      cancelRemove: "Keep this agent",
      unregister: "Remove from governance",
      unregisterExplain:
        "Stops governing it. The agent keeps running in OpenClaw and its workspace is untouched, but because unregistered agents are refused, it will stop being able to do anything until it is registered again. Reversible.",
      delete: "Delete the agent",
      deleteExplain:
        "Removes it from governance AND deletes it from OpenClaw entirely, including its workspace and transcripts. Cannot be undone.",
      confirmUnregister: "Stop governing “{name}”?",
      confirmUnregisterDetails:
        "The agent and its workspace stay exactly as they are. It will be refused on every tool call until it is registered again, and you can register it again at any time.",
      // Both kept to one clause: a completed-but-incomplete deletion needs the
      // reason more than it needs prose, and every string here is charged to the
      // startup bundle (finding 321).
      removeAuditFailed: "Deleted, but NOT written to the audit ledger: {reason}",
      removeClearFailed: "Deleted, but its rules could not be cleared: {reason}",
      confirmDelete: "Permanently delete “{name}”?",
      confirmDeleteDetails:
        "This deletes the agent from OpenClaw, not just from governance. Its workspace and transcripts go with it. This cannot be undone.",
      idLabelHelp: "Identifier",
      workspaceLabelHelp: "Working directory",
      modelLabel: "Model",
      modelPlaceholder: "Model, optional — OpenClaw uses its default",
      createTitle: "Create an agent",
      createHint:
        "Creates a real OpenClaw agent and records it here in one step. You own it, and it is governed from the moment it exists.",
      // **Root picks the owner, so "you own it" is not true for Root**
      // (2026-09-08). The form shows an owner select to Root alone —
      // `mustChooseOwner` — and an agent Root creates for an Administrator
      // is answerable to that Administrator, not to Root. The hint was
      // written for the tier that has no choice to make.
      createHintChooseOwner:
        "Creates a real OpenClaw agent and records it here in one step. It is governed from the moment it exists, and the account you choose below is the one answerable for it.",
      nameLabel: "Agent name",
      idLabel: "Agent id",
      idPlaceholder: "Agent id — optional, derived from the name",
      workspaceLabel: "Workspace",
      workspacePlaceholder: "Working directory — optional, OpenClaw chooses one",
      ownerLabel: "Owning account",
      ownerPlaceholder: "Choose who owns this agent...",
      ownerRootSuffix: "{username} (you, Root)",
      create: "Create agent",
      created:
        "Created {id}, and OpenClaw has picked it up. That id is what you use to talk to it, write rules for it, or stop it.",
      // Appended only when the id was already carrying something (T55). Kept to
      // one clause because every string here is charged to the startup bundle
      // (finding 321), and because the detail belongs in Agent permissions,
      // which is where this points.
      inherited: "That id already carried {what}, which now applies to this agent.",
      inheritedRules: "{count} rule(s)",
      inheritedMode: "a posture override",
      inheritedAsk: "an escalation override",
      inheritedTimeout: "an escalation timeout",
      inheritedLocked: "an active stop",
    },
    conversation: {
      taskForAgent: "Task for {agent}",
      taskDetails: "Started by {username} at {time}",
      cancelTask: "Cancel task for {agent} started at {time}",
      runningTask: "Running",
      stopping: "Stopping…",
      savingReply: "Saving reply…",
      cancelRequested: "Cancellation requested. The task stays listed until it finishes stopping.",
      noLongerRunning: "This task is no longer running. The list has been refreshed.",
      runsUnavailable:
        "Running tasks could not be refreshed. The last known state is shown; try refreshing the page. {reason}",
      replyRefreshFailed:
        "The task finished, but its saved reply could not be refreshed yet. This page will try again. {reason}",
      switchBlocked:
        "A task for {agent} is still running in this tab. Cancel it or wait for it to finish before opening another conversation.",
      taskInProgress: "Task in progress",
      title: "Your agents",
      open: "Talk",
      close: "Close",
      agentHint:
        "Send this agent a task. Every action it takes is still checked against your policy.",
      chooseAgent: "Agent to talk to",
      chooseAgentHint:
        "You manage every agent, so there is no assigned list. Pick one, or type an id.",
      // **The User tier reaching the same empty state means the opposite**
      // (2026-09-08). The branch above keyed on "the assigned list is empty",
      // which is true both for an Administrator, who has no list because
      // their scope is every agent, and for a User who has a list with
      // nothing in it. A User with no agents was told "You manage every
      // agent" — the exact inverse of their tier, on the one tier the
      // distinction is for, and an invitation to type an id the server will
      // refuse.
      chooseAgentHintUnassigned:
        "No agents are assigned to you yet. You can only work with agents an Administrator assigns to you; ask yours to add one.",
      chooseAgentPick: "Choose an agent…",
      // The row title for a User with an empty assignment. "Agent to talk
      // to" labelled a control that is no longer offered to that tier, so
      // it read as a field that had failed to draw (2026-09-08).
      noAssignedTitle: "No agents assigned to you",
      // Shown in place of the message box when an agent is taken away from a
      // User while its conversation is open: the box could only be refused.
      noLongerAssigned:
        "This agent is no longer assigned to you, so you cannot send it messages. Ask an Administrator if you still need it.",
      // Its own name. The picker and the id box beside it both answered
      // to "Agent to talk to", so the row offered a screen reader two
      // controls it could not tell apart (2026-09-08).
      typeAgentId: "Or type an agent id",
      loading: "Loading the conversation…",
      empty: "No messages yet. Send the first one below.",
      emptyReply:
        "The agent finished without saying anything. That is a real outcome, not a failure — it happens when every action it tried was refused by your policy. The audit ledger below records what it attempted.",
      transcriptLabel: "Conversation with {agent}",
      you: "You",
      send: "Send",
      sending: "Working…",
      failed: "The run did not complete",
      promptLabel: "Message to the agent",
      promptPlaceholder: "Ask the agent to do something…",
      unsupported:
        "This process cannot run agents, so prompting is unavailable here. Start the Gateway to enable it.",
      working: "replying…",
      thinking: "Working. Nothing said yet.",
      cancel: "Cancel",
      cancelHint:
        "Stops this one prompt. The agent stays available. Use Stop agent for an emergency.",
      attach: "Attach",
      attaching: "Uploading…",
      attachHint:
        "Send files with your message. The audit trail records each file's name, type, size and fingerprint. Never its contents.",
      attachmentsQueued: "Files attached to this message",
      attachmentRemove: "Remove {name} from this message",
    },
    sessions: {
      title: "Active agent sessions",
      running: "running",
      runningFor: "running for",
      lockedDown: "locked down",
      stop: "Stop agent",
      observe: "Observe",
      stopObserving: "Stop observing",
      observing: "observing (not blocking)",
      followsDefault: "follows installation",
      // Kept short on purpose: every locale string is charged to the startup
      // bundle, which finding 321 is about.
      startedBy: "started by {username}",
      idle: "No agent sessions are running",
      idleHint: "Sessions appear here while an agent is working.",
      unavailable: "Live session view unavailable",
      // **"not available from the CLI" named a surface removed on 2026-09-07**
      // and said so to an operator until 2026-09-08 (finding 320). It survived
      // the nineteen-document rewrite, the eleven-finding audit written to
      // catch exactly this, and the standing removal probe — because all three
      // searched for the command's *spelling*, `openclaw governance ...`, and
      // this sentence names the surface in prose instead. Finding 285's class,
      // one string over, with the search that found 285 unable to see it.
      //
      // Rewritten to what is actually true of this state now: the view needs
      // the Gateway's own run registry, so a process that is not it, or is not
      // finished starting, cannot answer. The second sentence is the one an
      // operator meeting this panel needs, because "I cannot see what is
      // running" reads like "the gate is off" and is not.
      unavailableHint:
        "This view comes from the Gateway's own run registry, so it cannot be shown before startup finishes or from a process that does not run agents. Policy is still enforced and the audit ledger is still recording.",
    },
    system: {
      title: "System resources",
      memory: "Memory in use",
      cpu: "Processor",
      uptime: "Uptime",
      host: "host",
      gateway: "gateway",
    },
    requests: {
      title: "Rule requests",
      by: "requested by",
      decidedBy: "decided by",
      approve: "Approve",
      reject: "Reject",
      pending: "awaiting an administrator",
      empty: "No rule requests",
      emptyHint: "A User can request access here when an action outside their scope is denied.",
      submit: "Request a rule",
      // **Split in two, because only the first sentence has a tier in it**
      // (2026-09-08). The whole hint was written for the User this queue
      // exists for and was then shown to Administrator and Root as well, so
      // the two tiers that *decide* these requests were told to "ask an
      // Administrator" — and both can simply write the rule. Finding 303's
      // shape: one sentence, one tier, every tier reading it.
      submitHintAsk: "Ask an Administrator to allow something outside the agents you manage.",
      // What the form does, which is true whoever is looking at it.
      submitHint:
        "Approving creates the rule. Naming an agent scopes the rule to it; leaving the agent blank asks for a rule binding every agent.",
      reasonPlaceholder: "Why do you need this? Up to 500 characters.",
      reasonLabel: "Reason for this request",
      agentLabel: "Agent this request is for",
      agentPlaceholder: "Agent id (blank = every agent)",
      scopeAgent: "for agent",
      settingTitle: "Change {setting} to “{value}”",
      settingAsk: "escalation",
      settingMode: "posture",
      settingKind: "agent setting",
      scopeGlobal: "EVERY AGENT",
      submitButton: "Submit request",
    },
    kill: {
      title: "Emergency kill switch",
      noticeUnconfirmed:
        "Stop signal sent, but the agent was not confirmed to have stopped. Runs signalled:",
      signalled: "signalled in",
      noticeStopped: "Lockdown engaged. In-flight runs aborted:",
      noticeNoRuns:
        "Lockdown engaged, but no in-flight run matched that agent id. The agent will be blocked from further actions; check whether the id is correct and whether anything is still executing.",
      noticeNoTermination:
        "Lockdown engaged, but in-flight termination is unavailable here. Anything the agent is doing right now continues until it finishes. Further actions are blocked.",
      noticeAuditFailed:
        "Lockdown engaged and the agent IS stopped, but this stop could not be written to the audit ledger, so the trail has no record of it: {reason}. Check the governance directory is writable, then note the stop by hand.",
      engage: "Lock down an agent",
      /**
       * ~~"Root only."~~ **Wrong on every surface, and wrong for the life of the
       * panel (T42, 2026-09-01).** The route admits a User with
       * `canManageAgent`; the panel itself was shown to Administrator and above;
       * and this string said Root. Two strings now, because the two tiers are
       * making different promises, and neither says "only", because the word
       * was doing the damage: it told a User the one emergency control was not
       * theirs.
       */
      hintAdmin:
        "Immediately denies every future governed action from this agent. You can stop any agent in your organisation.",
      hintUser:
        "Immediately denies every future governed action from this agent. You can stop the agents assigned to you.",
      notYourAgent:
        "That agent is not assigned to you, so you cannot stop it. Ask an Administrator, or pick one of your own agents from the list.",
      /**
       * The status beside the "Emergency stop" row in the per-agent policy
       * view. **Missing until 2026-09-01**, so that row rendered the literal
       * text `governance.kill.engaged` next to "Emergency stop". Finding 179's
       * class, found by resolving all 317 keys the governance UI uses against
       * this catalogue rather than by reading the panel.
       */
      engaged: "Engaged, this agent is locked down",
      agentIdPlaceholder: "Agent id",
      unknownAgent:
        "No agent with this id is running, locked down, or assigned to an account. Locking it down will still succeed and record an entry, but if you have mistyped the id, the agent you meant will keep running.",
      // Known to the page and not governed, which the refusal below called
      // "you do not manage" — false for the Root and Administrator who read
      // it, and silent about the one thing that fixes it.
      unregisteredAgent:
        "This agent is not registered, so there is no policy record to lock down and the stop will be refused. Register it under Agents in your organisation first.",
      button: "Lock down",
      release: "Release",
      noneLocked: "No agents are currently locked down",
    },
  },
};
