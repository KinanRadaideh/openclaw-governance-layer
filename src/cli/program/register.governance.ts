// Governance command registration: inspect/edit the policy document, read the
// tamper-evident audit ledger, and trigger the kill switch from the terminal.
import type { Command } from "commander";
import { listActiveSessions } from "../../governance/active-sessions.js";
import type { AuditActorInput } from "../../governance/admin-audit.js";
import { tailLedger, verifyLedgerChain } from "../../governance/audit-ledger.js";
import { auditLoginSuccess, auditLogout } from "../../governance/auth-audit.js";
import { coreRules, seedRuleId } from "../../governance/baseline-policy.js";
import {
  currentCliIdentity,
  signOutCli,
  storeCliSession,
  toCliActor,
  toCliAuditActor,
} from "../../governance/cli-identity.js";
import { lockDownAgent, releaseAgentLockdown } from "../../governance/kill-switch.js";
import { decidePendingDecision, listPendingDecisions } from "../../governance/pending-decisions.js";
import {
  canAuthorPolicyForAgent,
  canManageAccounts,
  canManageAgent,
  canManageGlobalPolicy,
  type GovernanceActor,
} from "../../governance/permissions.js";
import {
  agentPolicyView,
  agentsForRule,
  knownAgentIds,
} from "../../governance/policy-projection.js";
import {
  addRuleChecked,
  loadPolicy,
  setCoreRuleEnabled,
  removeRule,
  setAgentAskMode,
  setAgentMode,
  setAskMode,
  setHitlTimeout,
  setMode,
} from "../../governance/policy-store.js";
import type { AskMode, GovernanceMode, ResourceKind } from "../../governance/policy-types.js";
import { describeRequest, submitRuleRequest } from "../../governance/rule-requests.js";
import {
  describeRuleRisks,
  isRuleAccess,
  isRuleEffect,
  resolveRuleTtl,
  validateRulePattern,
} from "../../governance/rule-validation.js";
import { updateSessionsPolicyAuthoring } from "../../governance/session-tokens.js";
import { issueSession } from "../../governance/session-tokens.js";
import {
  deleteUnmigratedAccounts,
  listUnmigratedAccounts,
  setUserPolicyAuthoring,
} from "../../governance/user-store.js";
import { authenticate } from "../../governance/user-store.js";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { promptSecret, promptText } from "../prompt.js";

/**
 * Resolves the signed-in operator and checks their tier, or refuses.
 *
 * One helper rather than a check per command, and it takes the *question* as a
 * predicate so every command asks it through the same permission functions the
 * HTTP routes use (`canManageGlobalPolicy`, `canAuthorPolicyForAgent`,
 * `canManageAgent`). Two surfaces that ask the same question two ways is how
 * they end up giving two answers, which is this project's most-found defect.
 *
 * Returns the audit actor on success so the caller has nothing to remember: the
 * only way to get past this function is holding the value it produces.
 */
async function requireCliActor(
  runtime: typeof defaultRuntime,
  what: string,
  permitted: (actor: GovernanceActor) => boolean,
): Promise<AuditActorInput | undefined> {
  const identity = await currentCliIdentity();
  if (!identity) {
    runtime.log("Not signed in. Run `openclaw governance login` first.");
    return undefined;
  }
  if (!permitted(toCliActor(identity))) {
    runtime.log(`Your account (${identity.role}) is not permitted to ${what}.`);
    return undefined;
  }
  return toCliAuditActor(identity);
}

export function registerGovernanceCommands(program: Command): void {
  const governance = program
    .command("governance")
    .description("Policy-based governance layer: default-deny tool policy and audit ledger");

  // ---------------------------------------------------------------------
  // Identity (T5). Before this, every command-line change was recorded against
  // the literal actor `cli` and no tier was checked at all — so the audit trail
  // could not name a person and the command line ignored the role model that
  // the dashboard enforces.
  // ---------------------------------------------------------------------
  governance
    .command("login")
    .description("Sign in so command-line changes are recorded against your account")
    .argument("[username]", "Account name; prompted for when omitted")
    .action(async (username?: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const name = username ?? (await promptText("Account: "));
        const password = await promptSecret("Password: ");
        const user = await authenticate(name, password);
        if (!user) {
          // Deliberately the same message for a wrong password and an unknown
          // account, matching the dashboard: the command line must not become
          // the account-existence oracle the HTTP surface is careful not to be.
          defaultRuntime.log("Invalid credentials.");
          return;
        }
        const session = await issueSession(user);
        await storeCliSession(session.token);
        await auditLoginSuccess(user);
        defaultRuntime.log(`Signed in as ${user.username} (${user.role}).`);
      });
    });

  governance
    .command("logout")
    .description("End the command-line session")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const identity = await currentCliIdentity();
        await signOutCli();
        if (identity) {
          await auditLogout({ userId: identity.username, username: identity.username });
        }
        defaultRuntime.log(identity ? `Signed out ${identity.username}.` : "Not signed in.");
      });
    });

  governance
    .command("whoami")
    .description("Show which account the command line is signed in as")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const identity = await currentCliIdentity();
        if (!identity) {
          defaultRuntime.log("Not signed in.");
          return;
        }
        defaultRuntime.log(`${identity.username} (${identity.role})`);
        defaultRuntime.log(
          identity.assignedAgents.length > 0
            ? `  agents: ${identity.assignedAgents.join(", ")}`
            : "  agents: none assigned",
        );
      });
    });

  const policy = governance.command("policy").description("Inspect or edit the policy document");

  policy
    .command("show")
    .description("Print the current policy document")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        defaultRuntime.log(JSON.stringify(await loadPolicy(), null, 2));
      });
    });

  governance
    .command("set-policy-authoring <userId> <allowed>")
    .description("Root: allow or withhold a User account's ability to write policy")
    .action(async (userId: string, allowed: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        if (allowed !== "true" && allowed !== "false") {
          defaultRuntime.log("allowed must be true or false");
          return;
        }
        const actor = await requireCliActor(defaultRuntime, "change policy authoring", (a) =>
          canManageAccounts(a),
        );
        if (!actor) {
          return;
        }
        const ok = await setUserPolicyAuthoring(userId, allowed === "true", actor);
        defaultRuntime.log(
          ok
            ? `policy authoring ${allowed === "true" ? "allowed" : "withheld"} for ${userId}`
            : `no account with id ${userId}`,
        );
        // The sessions file is the other half; without it a signed-in User keeps
        // the old permission until their session expires.
        await updateSessionsPolicyAuthoring(userId, allowed === "true");
      });
    });

  const groups = governance
    .command("groups")
    .description("Groups: the isolated worlds accounts belong to (S3)");

  groups
    .command("unmigrated")
    .description("List accounts written before groups existed, which can no longer sign in")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const orphans = await listUnmigratedAccounts();
        if (orphans.length === 0) {
          defaultRuntime.log("no accounts predate groups; nothing to migrate");
          return;
        }
        defaultRuntime.log(
          `${orphans.length} account(s) predate groups and cannot sign in until removed:`,
        );
        for (const account of orphans) {
          defaultRuntime.log(`  ${account.username} (${account.role}, id ${account.id})`);
        }
        defaultRuntime.log("");
        defaultRuntime.log("Run: openclaw governance groups migrate --delete");
      });
    });

  groups
    .command("migrate")
    .description("Delete every account that predates groups. Destructive; requires --delete")
    .option("--delete", "Confirm the deletion. Without it this only reports what would go")
    .action(async (options: { delete?: boolean }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const orphans = await listUnmigratedAccounts();
        if (orphans.length === 0) {
          defaultRuntime.log("no accounts predate groups; nothing to do");
          return;
        }
        if (!options.delete) {
          // Deliberately two steps. This removes credentials, and the only
          // recovery is a password nobody has — so the destructive form has to
          // be typed rather than defaulted into.
          defaultRuntime.log(`${orphans.length} account(s) would be deleted:`);
          for (const account of orphans) {
            defaultRuntime.log(`  ${account.username} (${account.role})`);
          }
          defaultRuntime.log("");
          defaultRuntime.log("Re-run with --delete to remove them.");
          return;
        }
        // Attributed to the signed-in operator when there is one. On an
        // installation whose only accounts predate groups there is nobody left
        // who *can* sign in, which is precisely the state this repairs — so the
        // command still runs, attributed to the command line itself.
        const identity = await currentCliIdentity();
        const removed = await deleteUnmigratedAccounts(
          identity ? toCliAuditActor(identity) : { name: "cli", role: "root" },
        );
        defaultRuntime.log(`deleted ${removed} account(s) that predated groups`);
      });
    });

  policy
    .command("request-setting <agentId> <setting> <value>")
    .description("Ask an Administrator to change an agent's escalation (ask) or posture (mode)")
    .requiredOption("--reason <reason>", "Why the change is needed; an Administrator reads this")
    .action(
      async (agentId: string, setting: string, value: string, options: { reason: string }) => {
        await runCommandWithRuntime(defaultRuntime, async () => {
          if (setting !== "ask" && setting !== "mode") {
            defaultRuntime.log("setting must be ask or mode");
            return;
          }
          const allowed = setting === "ask" ? ["off", "on-miss"] : ["enforce", "monitor", "off"];
          if (!allowed.includes(value)) {
            defaultRuntime.log(`value must be one of: ${allowed.join(", ")}`);
            return;
          }
          // Requesting is not authoring, so the check is `canManageAgent` — a
          // User whose authoring Root has withheld may still ask.
          const requester = await currentCliIdentity();
          if (!requester) {
            defaultRuntime.log("Not signed in. Run `openclaw governance login` first.");
            return;
          }
          if (!canManageAgent(toCliActor(requester), agentId)) {
            defaultRuntime.log(`You do not manage agent "${agentId}".`);
            return;
          }
          const request = await submitRuleRequest({
            kind: "agent-setting",
            agentId,
            setting,
            value,
            reason: options.reason,
            requestedBy: requester.username,
          });
          defaultRuntime.log(`submitted ${request.id}: ${describeRequest(request)}`);
          defaultRuntime.log("An Administrator must approve it before it takes effect.");
        });
      },
    );

  policy
    .command("core-rule <ruleId> <enabled>")
    .description("Root: switch a shipped core denial off or back on (self-protecting ones refuse)")
    .action(async (ruleId: string, enabled: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        if (enabled !== "true" && enabled !== "false") {
          defaultRuntime.log("enabled must be true or false");
          return;
        }
        try {
          const actor = await requireCliActor(defaultRuntime, "change core rules", (a) =>
            canManageAccounts(a),
          );
          if (!actor) {
            return;
          }
          await setCoreRuleEnabled(ruleId, enabled === "true", actor);
          defaultRuntime.log(
            `core rule ${ruleId} ${enabled === "true" ? "re-enabled" : "DISABLED"}`,
          );
        } catch (err) {
          defaultRuntime.log(err instanceof Error ? err.message : String(err));
        }
      });
    });

  policy
    .command("core-rules")
    .description("List the shipped core denials and which are switched off")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const doc = await loadPolicy();
        const disabled = new Set(doc.disabledCoreRules ?? []);
        // Read from the document, which is the reasserted view: a disabled
        // rule is absent from `doc.rules` by then, so its state is read from
        // the list rather than inferred from the rule being missing.
        for (const rule of coreRules()) {
          const id = seedRuleId(rule);
          const state = rule.selfProtecting
            ? "IMMUTABLE"
            : disabled.has(id)
              ? "OFF      "
              : "on       ";
          defaultRuntime.log(`${state} ${id}`);
          defaultRuntime.log(`          ${rule.description ?? ""}`);
        }
      });
    });

  policy
    .command("for-agent <agentId>")
    .description("Show the posture and every rule in force for one agent")
    .action(async (agentId: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const view = agentPolicyView(await loadPolicy(), agentId);
        const { posture, summary } = view;
        defaultRuntime.log(`agent ${posture.agentId}`);
        defaultRuntime.log(
          `  posture   ${posture.mode}${posture.modeIsOverride ? " (per-agent override)" : " (installation default)"}`,
        );
        defaultRuntime.log(
          `  escalate  ${posture.ask}${posture.askIsOverride ? " (per-agent override)" : " (installation default)"}`,
        );
        if (posture.lockedDown) {
          defaultRuntime.log("  LOCKED DOWN — the kill switch is engaged for this agent");
        }
        defaultRuntime.log(
          `  rules     ${summary.total} in force (${summary.global} global, ${summary.agentSpecific} agent-scoped; ${summary.allows} allow, ${summary.denies} deny)`,
        );
        for (const { rule, scope } of view.rules) {
          const expiry = rule.expiresAt ? ` until ${rule.expiresAt}` : "";
          defaultRuntime.log(
            // `effect` is optional on the stored shape and defaults to allow,
            // matching how the engine reads it — a rule without one is an
            // allowance, not an unprintable.
            `    [${scope === "global" ? "global" : "agent "}] ${(rule.effect ?? "allow").padEnd(5)} ${rule.resourceKind.padEnd(7)} ${rule.pattern}${expiry}  (${rule.tier}, ${rule.id})`,
          );
        }
      });
    });

  policy
    .command("rule-agents <ruleId>")
    .description("Show which agents a rule binds")
    .action(async (ruleId: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const doc = await loadPolicy();
        const rule = doc.rules.find((candidate) => candidate.id === ruleId);
        if (!rule) {
          defaultRuntime.log(`no rule with id ${ruleId}`);
          return;
        }
        const targets = agentsForRule(rule, knownAgentIds(doc));
        defaultRuntime.log(
          `rule ${rule.id}  ${rule.effect ?? "allow"} ${rule.resourceKind} ${rule.pattern}`,
        );
        if (targets.scope === "agent") {
          defaultRuntime.log(`  binds one agent: ${targets.agentIds[0]}`);
          return;
        }
        // Said before the list, not after it. A reader who sees three ids and
        // then a footnote has already formed the wrong impression.
        defaultRuntime.log("  GLOBAL — binds every agent, including ones not yet created");
        defaultRuntime.log(
          targets.agentIds.length > 0
            ? `  currently known: ${targets.agentIds.join(", ")}`
            : "  no agents known to the policy document yet",
        );
      });
    });

  policy
    .command("set-mode <mode>")
    .description("Set posture: enforce | monitor | off")
    .action(async (mode: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        assertGovernanceMode(mode);
        const actor = await requireCliActor(
          defaultRuntime,
          "change the installation posture",
          (a) => canManageGlobalPolicy(a),
        );
        if (!actor) {
          return;
        }
        await setMode(mode, actor);
        defaultRuntime.log(`mode set to ${mode}`);
      });
    });

  policy
    .command("set-ask <mode>")
    .description("Set ask-on-miss behavior: off | on-miss")
    .action(async (mode: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        assertAskMode(mode);
        const actor = await requireCliActor(defaultRuntime, "change the escalation mode", (a) =>
          canManageGlobalPolicy(a),
        );
        if (!actor) {
          return;
        }
        await setAskMode(mode, actor);
        defaultRuntime.log(`ask set to ${mode}`);
      });
    });

  policy
    .command("add-rule")
    .description("Add a rule that allows or forbids something")
    .requiredOption("--kind <kind>", "command | path | network")
    .requiredOption("--pattern <regex>", "regular expression tested against the resource")
    // Denials are authorable here as of R5. The engine has enforced them since
    // the tier model landed and the shipped core rules *are* denials, but no
    // surface could create one, so an operator's own restriction meant editing
    // policy.json by hand.
    .option("--effect <effect>", "allow (default) | deny — a deny rule beats every allowance")
    .option("--access <access>", "path rules only: read | write (omit for both directions)")
    .option("--description <text>", "human-readable note")
    .option("--ttl-minutes <n>", "expire this rule after N minutes (omit for indefinite)")
    .option("--agent <agentId>", "scope the rule to one agent (omit for all agents)")
    .action(
      async (options: {
        kind: string;
        pattern: string;
        effect?: string;
        access?: string;
        description?: string;
        ttlMinutes?: string;
        agent?: string;
      }) => {
        await runCommandWithRuntime(defaultRuntime, async () => {
          assertResourceKind(options.kind);
          // Same validator the dashboard uses, so the CLI cannot author a rule
          // the dashboard would refuse — length, compilability, backtracking
          // safety, and the TTL bound (see governance/rule-validation.ts).
          const validated = validateRulePattern(options.pattern);
          if (!validated.ok) {
            throw new Error(validated.error);
          }
          const ttl = resolveRuleTtl(options.ttlMinutes);
          if (!ttl.ok) {
            throw new Error(ttl.error);
          }
          if (options.effect !== undefined && !isRuleEffect(options.effect)) {
            throw new Error(`Invalid effect "${options.effect}". Expected allow or deny.`);
          }
          if (options.access !== undefined && !isRuleAccess(options.access)) {
            throw new Error(`Invalid access "${options.access}". Expected read or write.`);
          }
          // Refused rather than ignored: the engine only consults `access` for
          // path rules, so storing it on a command rule would leave the
          // operator believing a narrowing took hold that does nothing.
          if (options.access !== undefined && options.kind !== "path") {
            throw new Error("--access applies to path rules only.");
          }
          const effect = isRuleEffect(options.effect) ? options.effect : undefined;
          const access = isRuleAccess(options.access) ? options.access : undefined;
          const expiresAt = ttl.expiresAt;
          const agentId = options.agent?.trim();
          // Earlier rules win: report the clash rather than silently letting
          // the operator believe a restriction took hold that did not.
          // Detected inside the write lock by `addRuleChecked`, so a CLI write
          // racing a dashboard write cannot miss a clash the way both used to.
          //
          // Scope decides the tier, exactly as at the HTTP route: a rule with
          // no agent id binds every agent and is an Administrator's to write,
          // while an agent-scoped one needs authoring rights over that agent.
          const ruleActor = await requireCliActor(
            defaultRuntime,
            agentId ? `write rules for agent "${agentId}"` : "write a global rule",
            (a) => (agentId ? canAuthorPolicyForAgent(a, agentId) : canManageGlobalPolicy(a)),
          );
          if (!ruleActor) {
            return;
          }
          const { rule, conflicts } = await addRuleChecked(
            {
              resourceKind: options.kind,
              pattern: validated.pattern,
              ...(options.description ? { description: options.description } : {}),
              ...(expiresAt ? { expiresAt } : {}),
              ...(agentId ? { agentId } : {}),
              ...(effect ? { effect } : {}),
              ...(access ? { access } : {}),
            },
            ruleActor,
          );
          defaultRuntime.log(JSON.stringify(rule, null, 2));
          for (const risk of describeRuleRisks(validated.pattern, options.kind, {
            ...(effect ? { effect } : {}),
            ...(access ? { access } : {}),
          })) {
            defaultRuntime.log(`warning: ${risk.message}`);
          }
          for (const conflict of conflicts) {
            // The two kinds of clash mean opposite things and must not be
            // printed under one heading: an allowance clash says the new rule
            // adds nothing, a denial clash says it does nothing at all.
            const lead =
              conflict.kind === "overridden-by-deny"
                ? "warning: a deny rule overrides this, so it will never take effect"
                : "warning: an earlier rule already covers this";
            defaultRuntime.log(`${lead} (${conflict.existingPattern}) — ${conflict.message}`);
          }
        });
      },
    );

  policy
    .command("remove-rule <id>")
    .description("Remove a rule by id")
    .action(async (id: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const actor = await requireCliActor(defaultRuntime, "remove rules", (a) =>
          canManageGlobalPolicy(a),
        );
        if (!actor) {
          return;
        }
        const removed = await removeRule(id, actor);
        defaultRuntime.log(removed ? `removed ${id}` : `no rule with id ${id}`);
        if (!removed) {
          defaultRuntime.exit(1);
        }
      });
    });

  policy
    .command("set-agent-ask <agentId> <mode>")
    .description("Per-agent override of ask behaviour: off | on-miss | default")
    .action(async (agentId: string, mode: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        // Administrator since T4, matching the HTTP route. A User asks through
        // `governance policy request-setting` instead.
        const actor = await requireCliActor(
          defaultRuntime,
          "set an agent's escalation behaviour",
          (a) => canManageGlobalPolicy(a),
        );
        if (!actor) {
          return;
        }
        if (mode === "default") {
          await setAgentAskMode(agentId, undefined, actor);
          defaultRuntime.log(`agent "${agentId}" now follows the installation default`);
          return;
        }
        assertAskMode(mode);
        await setAgentAskMode(agentId, mode, actor);
        defaultRuntime.log(`agent "${agentId}" ask set to ${mode}`);
      });
    });

  policy
    .command("set-agent-mode <agentId> <mode>")
    .description("Per-agent posture, for observing one agent: enforce | monitor | default")
    .action(async (agentId: string, mode: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const actor = await requireCliActor(defaultRuntime, "set an agent's posture", (a) =>
          canManageGlobalPolicy(a),
        );
        if (!actor) {
          return;
        }
        if (mode === "default") {
          await setAgentMode(agentId, undefined, actor);
          defaultRuntime.log(`agent "${agentId}" now follows the installation posture`);
          return;
        }
        // `off` is refused here for the same reason the HTTP route refuses it:
        // a per-agent `off` removes the kill switch and the core denials from
        // that agent, not merely its ordinary rules. Switching the gate off is
        // an installation-wide decision, made with `set-mode off`.
        if (mode !== "enforce" && mode !== "monitor") {
          throw new Error(
            `Invalid agent posture "${mode}". Expected enforce, monitor, or default. ` +
              `Use "governance policy set-mode off" to switch the gate off installation-wide.`,
          );
        }
        await setAgentMode(agentId, mode, actor);
        defaultRuntime.log(`agent "${agentId}" posture set to ${mode}`);
      });
    });

  policy
    .command("set-hitl-timeout <seconds>")
    .description("How long an escalation waits for a human before timing out")
    .action(async (seconds: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const value = Number(seconds);
        if (!Number.isFinite(value) || value < 5 || value > 86_400) {
          throw new Error("seconds must be a number between 5 and 86400");
        }
        const actor = await requireCliActor(defaultRuntime, "change the escalation timeout", (a) =>
          canManageAccounts(a),
        );
        if (!actor) {
          return;
        }
        await setHitlTimeout(Math.round(value), actor);
        defaultRuntime.log(`escalation timeout set to ${Math.round(value)}s`);
      });
    });

  // ---------------------------------------------------------------------
  // Talking to an agent (backlog item A1).
  //
  // The dashboard is the surface the paper describes, but the capability is
  // not Gateway-owned — running a prompt needs the agent stack and nothing
  // else — so it is offered here too. **The attribution caveat is gone (T5):**
  // a prompt from a terminal is recorded against the signed-in account and its
  // tier, exactly as from the dashboard, and the conversation belongs to that
  // account rather than to the machine. Before T5 two operators sharing a host
  // shared a transcript and the ledger could not say which of them set the
  // agent going.
  // ---------------------------------------------------------------------
  const agent = governance.command("agent").description("Interact with a governed agent");

  agent
    .command("prompt <agentId> <message...>")
    .description("Send a prompt to an agent and print its reply")
    .option("--stream", "print the reply as it is produced, instead of at the end")
    .option(
      "--attach <path...>",
      "file(s) to send with the prompt; recorded by hash, type and size, never by content",
    )
    .action(
      async (
        agentId: string,
        messageParts: string[],
        options: { stream?: boolean; attach?: string[] },
      ) => {
        await runCommandWithRuntime(defaultRuntime, async () => {
          // Registered lazily, on use. Importing the agent stack at module load
          // would make every `openclaw governance ...` invocation — including
          // `policy show` — pay for a capability almost none of them need.
          const { installGovernanceAgentRunner } =
            await import("../../agents/governance-agent-runner.js");
          installGovernanceAgentRunner();
          const { promptAgent } = await import("../../governance/agent-conversation.js");

          // Ctrl-C cancels the run rather than only killing the printout.
          //
          // There is no `governance agent cancel` command, and that is a fact
          // about the architecture rather than an omission: the in-flight run
          // table is per **process**, and the CLI runs the agent in its own. A
          // command that could only ever cancel a run in the same terminal it was
          // typed into is not a control, and one that appeared to reach the
          // Gateway's runs but could not would be a control surface reporting
          // success it did not achieve — which this layer refuses to do. The
          // dashboard is the surface for stopping somebody else's run.
          const interrupted = new AbortController();
          const onSigint = () => interrupted.abort();
          process.once("SIGINT", onSigint);

          // Streaming is opt-in here, unlike the dashboard.
          //
          // A terminal is often reading into a pipe or a file, where partial
          // snapshots would be written repeatedly and the output would no longer
          // be the reply. Printing once at the end is the correct default for a
          // command; `--stream` is for watching a long task by hand.
          // The conversation belongs to the account, not to the machine. Before
          // T5 every CLI prompt was owned by `cli`, so two operators on one host
          // shared a transcript and the ledger could not say which of them set
          // the agent going.
          const promptIdentity = await currentCliIdentity();
          if (!promptIdentity) {
            defaultRuntime.log("Not signed in. Run `openclaw governance login` first.");
            return;
          }
          if (!canManageAgent(toCliActor(promptIdentity), agentId)) {
            defaultRuntime.log(`You do not manage agent "${agentId}".`);
            return;
          }
          // Stored before the run, so a prompt that fails still leaves the
          // evidence of what was handed over. The bytes go to the governed store;
          // only hash, type, size and the declared name travel onward.
          const attachments: {
            sha256: string;
            bytes: number;
            mimeType: string;
            declaredName: string;
          }[] = [];
          for (const path of options.attach ?? []) {
            const { readFile: readAttachment } = await import("node:fs/promises");
            const { basename } = await import("node:path");
            const { storeAttachment } = await import("../../governance/attachment-store.js");
            try {
              const stored = await storeAttachment({
                content: new Uint8Array(await readAttachment(path)),
                declaredName: basename(path),
                storedBy: promptIdentity.username,
                agentId,
              });
              attachments.push({
                sha256: stored.sha256,
                bytes: stored.bytes,
                mimeType: stored.mimeType,
                declaredName: stored.declaredName,
              });
              // Marked immediately, because this command stores and sends in
              // one step: from here a ledger entry will name the file, so it is
              // no longer the uploader's to discard (QA round 17, finding 113).
              const { markAttachmentUsed } = await import("../../governance/attachment-store.js");
              await markAttachmentUsed(stored.sha256);
              defaultRuntime.log(
                `attached ${stored.declaredName} (${stored.mimeType}, ${stored.bytes} bytes)`,
              );
            } catch (err) {
              defaultRuntime.log(err instanceof Error ? err.message : `could not attach ${path}`);
              return;
            }
          }
          let printed = 0;
          try {
            const outcome = await promptAgent({
              agentId,
              username: promptIdentity.username,
              message: messageParts.join(" "),
              ...(attachments.length > 0 ? { attachments } : {}),
              signal: interrupted.signal,
              ...(options.stream
                ? {
                    onProgress: (replySoFar: string) => {
                      // Snapshots arrive whole; only the new tail is printed, so
                      // a terminal shows a reply being written rather than the
                      // same text repeatedly. A snapshot shorter than what was
                      // already printed is a retraction, which a terminal cannot
                      // unprint — so it starts a fresh line rather than silently
                      // dropping the correction.
                      if (replySoFar.length < printed) {
                        defaultRuntime.log("");
                        printed = 0;
                      }
                      const tail = replySoFar.slice(printed);
                      if (tail) {
                        process.stdout.write(tail);
                        printed = replySoFar.length;
                      }
                    },
                  }
                : {}),
            });
            if (printed > 0) {
              process.stdout.write("\n");
            } else if (outcome.reply) {
              defaultRuntime.log(outcome.reply);
            }
            if (!outcome.ok) {
              defaultRuntime.log(`error: ${outcome.error ?? "the run did not complete"}`);
              defaultRuntime.exit(1);
            }
          } finally {
            process.off("SIGINT", onSigint);
          }
        });
      },
    );

  agent
    .command("transcript <agentId>")
    .description("Print this machine's conversation with an agent")
    .option("--limit <n>", "number of turns", "50")
    .action(async (agentId: string, options: { limit: string }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { readConversation } = await import("../../governance/agent-conversation.js");
        const limit = Number(options.limit);
        const reader = await currentCliIdentity();
        if (!reader) {
          defaultRuntime.log("Not signed in. Run `openclaw governance login` first.");
          return;
        }
        const turns = await readConversation(agentId, reader.username);
        const shown = Number.isFinite(limit) && limit > 0 ? turns.slice(-limit) : turns;
        if (shown.length === 0) {
          defaultRuntime.log(`no conversation with "${agentId}" from this machine`);
          return;
        }
        for (const turn of shown) {
          const who = turn.role === "user" ? "you" : agentId;
          defaultRuntime.log(
            `[${turn.at}] ${who}: ${turn.error ? `(failed: ${turn.error})` : turn.body}`,
          );
        }
      });
    });

  // ---------------------------------------------------------------------
  // Deployment and network posture (backlog item A7).
  //
  // Deliberately available from the command line as well as the dashboard, and
  // this is the surface that matters more of the two: §1.6 expects the
  // dashboard to be reachable only through an SSH local port forward, so the
  // moment you most need to know whether the listener is exposed is over a
  // plain SSH session *before* any tunnel exists — when the dashboard is, by
  // design, unreachable.
  //
  // Read-only. Changing a bind address or an auth mode is a server-admin act;
  // this reports what is true and judges it against what Chapter 1 promises.
  // ---------------------------------------------------------------------
  governance
    .command("deployment")
    .description("Verify the deployment and network posture of the governance layer")
    .option("--json", "print the full report as JSON")
    .option("--strict", "exit non-zero when any check fails")
    .action(async (options: { json?: boolean; strict?: boolean }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        // Lazy: these pull in the security audit and the config loader, and
        // `governance policy show` should not pay for them.
        const { resolveDeploymentEnvironmentInput } =
          await import("../../gateway/governance-deployment-input.js");
        const { readDeploymentStatus } = await import("../../governance/deployment-status.js");
        const { getRuntimeConfig, getRuntimeConfigSourceSnapshot } =
          await import("../../config/config.js");
        const cfg = getRuntimeConfig();
        const status = await readDeploymentStatus(
          resolveDeploymentEnvironmentInput({
            cfg,
            sourceConfig: getRuntimeConfigSourceSnapshot() ?? cfg,
          }),
        );

        if (options.json) {
          defaultRuntime.log(JSON.stringify(status, null, 2));
        } else {
          const memoryGb = (status.facts.totalMemoryBytes / 1000 ** 3).toFixed(1);
          defaultRuntime.log(`platform      ${status.facts.platform} · ${memoryGb} GB total`);
          defaultRuntime.log(
            `gateway       ${status.facts.bind}:${status.facts.port} · auth ${status.facts.authMode}`,
          );
          defaultRuntime.log(
            `governance    ${status.facts.governanceDir}${status.facts.governanceDirRelocated ? " (relocated)" : ""}`,
          );
          defaultRuntime.log("");
          for (const check of status.checks) {
            const label =
              check.status === "pass"
                ? "pass"
                : check.status === "warn"
                  ? "warn"
                  : check.status === "fail"
                    ? "FAIL"
                    : " ?  ";
            defaultRuntime.log(`[${label}] ${check.id}`);
            defaultRuntime.log(`         ${check.detail}`);
            if (check.remediation) {
              defaultRuntime.log(`         -> ${check.remediation}`);
            }
          }
          for (const note of status.facts.gatewayNotes) {
            defaultRuntime.log(`[note] ${note}`);
          }
          defaultRuntime.log("");
          defaultRuntime.log(
            `${status.summary.fail} failed · ${status.summary.warn} warnings · ` +
              `${status.summary.unknown} not determined here · ${status.summary.pass} passed`,
          );
        }

        // Exit 0 by default, matching `security audit`. A command that exits
        // non-zero on every developer machine — where the platform check warns
        // and the permission checks cannot run — is a command people learn to
        // ignore. `--strict` is for provisioning scripts, where failing the
        // build on a `fail` is exactly what you want.
        if (options.strict && status.summary.fail > 0) {
          defaultRuntime.exit(1);
        }
      });
    });

  governance
    .command("sessions")
    .description("List agent sessions currently running")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        // **Scoped to the signed-in account since T5.** This used to report
        // with full Root visibility on the premise that the command line had no
        // login and its only boundary was filesystem access. The premise is no
        // longer true, and leaving it would have made the CLI a way for a User
        // to enumerate every agent in the installation — the same disclosure
        // the dashboard's own scoping exists to prevent.
        const viewer = await currentCliIdentity();
        if (!viewer) {
          defaultRuntime.log("Not signed in. Run `openclaw governance login` first.");
          return;
        }
        const sessionsPolicy = await loadPolicy();
        const view = listActiveSessions({
          actor: toCliActor(viewer),
          lockedAgents: sessionsPolicy.lockedAgents,
        });
        if (!view.supported) {
          defaultRuntime.log(
            "live session view unavailable: the Gateway owns the run registry, so this only works from inside it",
          );
          return;
        }
        defaultRuntime.log(JSON.stringify(view.sessions, null, 2));
      });
    });

  const pending = governance
    .command("pending")
    .description("Escalations that timed out waiting for a human decision");

  pending
    .command("list")
    .description("Show the pending-decision stack, newest first")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        defaultRuntime.log(JSON.stringify(await listPendingDecisions(), null, 2));
      });
    });

  pending
    .command("decide <id>")
    .description("Record a late decision on a timed-out escalation")
    .option("--allow", "record that the action would have been allowed")
    .option("--deny", "record that the action stays denied")
    .action(async (id: string, options: { allow?: boolean; deny?: boolean }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        if (options.allow === options.deny) {
          throw new Error("specify exactly one of --allow or --deny");
        }
        const decided = await decidePendingDecision({
          id,
          allow: Boolean(options.allow),
          decidedBy: "cli",
        });
        if (!decided) {
          defaultRuntime.log(`no pending decision with id ${id}`);
          defaultRuntime.exit(1);
          return;
        }
        defaultRuntime.log(`recorded: ${decided.status}`);
        // Answering does not resurrect the dead turn; say so plainly.
        if (decided.status === "allowed") {
          defaultRuntime.log(
            "note: the original action is long finished. Add a rule so the next attempt succeeds.",
          );
        }
      });
    });

  const audit = governance.command("audit").description("Inspect the tamper-evident audit ledger");

  audit
    .command("tail")
    .description("Print the most recent ledger entries")
    .option("--limit <n>", "number of entries", "50")
    .action(async (options: { limit: string }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const entries = await tailLedger(Number(options.limit));
        defaultRuntime.log(JSON.stringify(entries, null, 2));
      });
    });

  audit
    .command("verify")
    .description("Recompute the hash chain and report the first tampered entry, if any")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const result = await verifyLedgerChain();
        defaultRuntime.log(JSON.stringify(result, null, 2));
        if (!result.ok) {
          defaultRuntime.exit(1);
        }
      });
    });

  governance
    .command("kill <agentId>")
    .description("Immediately deny every future governed tool call for an agent")
    .option("--release", "Release a previously engaged lockdown instead")
    .action(async (agentId: string, options: { release?: boolean }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        if (options.release) {
          await releaseAgentLockdown(agentId, "cli");
          defaultRuntime.log(`governance lockdown released for agent "${agentId}"`);
          return;
        }
        const outcome = await lockDownAgent(agentId, "cli");
        defaultRuntime.log(
          `governance lockdown engaged for agent "${agentId}" in ${outcome.elapsedMs.toFixed(1)}ms`,
        );
        defaultRuntime.log(
          outcome.termination.supported
            ? `aborted ${outcome.termination.abortedRunIds.length} in-flight run(s)`
            : "no in-flight termination available from the CLI (the Gateway owns the run registry)",
        );
      });
    });
}

function assertGovernanceMode(value: string): asserts value is GovernanceMode {
  if (value !== "enforce" && value !== "monitor" && value !== "off") {
    throw new Error(`Invalid mode "${value}". Expected enforce, monitor, or off.`);
  }
}

function assertAskMode(value: string): asserts value is AskMode {
  if (value !== "off" && value !== "on-miss") {
    throw new Error(`Invalid ask mode "${value}". Expected off or on-miss.`);
  }
}

function assertResourceKind(value: string): asserts value is ResourceKind {
  if (value !== "command" && value !== "path" && value !== "network") {
    throw new Error(`Invalid kind "${value}". Expected command, path, or network.`);
  }
}
