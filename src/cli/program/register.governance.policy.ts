// The policy document's command-line surface.
//
// Split out of `register.governance.ts` (T16), which was 848 code lines against
// the project's 700 limit after M4 moved the agent-registry commands into their
// own file. The seam is the same one the HTTP routes were split along, and it
// holds here for the same reason: **one file, one subject.**
//
//   *Everything here reads or edits the policy document* — the posture, the
//   escalation mode, the rules, the core denials, the per-agent overrides, the
//   two projections, and a User's request to change any of them.
//
// Authorization is not one sentence in this file, and that is a real difference
// from the route modules rather than an oversight: the tiers genuinely differ
// per command, from a Viewer reading `show` to Root toggling a core rule. What
// makes the file coherent is its subject. Every command asks its question
// through `requireCliActor` and the same `permissions.ts` helpers the HTTP
// routes use, so the two surfaces cannot drift into different answers about who
// may do what — the property T5 introduced this gate for.
import type { Command } from "commander";
import { coreRules, seedRuleId } from "../../governance/baseline-policy.js";
import { currentCliIdentity, toCliActor } from "../../governance/cli-identity.js";
import {
  canAuthorPolicyForAgent,
  canManageAccounts,
  canManageAgent,
  canManageGlobalPolicy,
} from "../../governance/permissions.js";
import {
  agentPolicyView,
  agentsForRule,
  knownAgentIds,
} from "../../governance/policy-projection.js";
import {
  addRuleChecked,
  loadPolicy,
  removeRule,
  setAgentAskMode,
  setAgentMode,
  setAskMode,
  setCoreRuleEnabled,
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
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { requireCliActor } from "./governance-cli-gate.js";

export function registerGovernancePolicyCommands(governance: Command): void {
  const policy = governance.command("policy").description("Inspect or edit the policy document");

  policy
    .command("show")
    .description("Print the current policy document")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        // **A read now needs an identity, which it did not before (M5).**
        //
        // Not a new permission so much as a newly answerable question: with one
        // policy document, "print the policy" had an unambiguous subject. With a
        // document per organisation it does not, and the only honest source for
        // *which* is the signed-in account — the same rule the HTTP surface
        // applies in `requireGroup`. `() => true` is the viewer tier: any
        // signed-in account may read its own organisation's rulebook.
        const actor = await requireCliActor(defaultRuntime, "read the policy", () => true);
        if (!actor) {
          return;
        }
        defaultRuntime.log(JSON.stringify(await loadPolicy(actor.groupId), null, 2));
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
          // The request is filed in the requester's own organisation (M5).
          // A User asking for a change to their agent cannot file it anywhere
          // else, because the only group they hold is their own.
          const requesterGroup = requester.groupId?.trim();
          if (!requesterGroup) {
            defaultRuntime.log(
              "Your account does not belong to an organisation, so it cannot file a request.",
            );
            return;
          }
          const request = await submitRuleRequest(requesterGroup, {
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
          await setCoreRuleEnabled(actor.groupId, ruleId, enabled === "true", actor);
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
        const actor = await requireCliActor(defaultRuntime, "list core rules", () => true);
        if (!actor) {
          return;
        }
        const doc = await loadPolicy(actor.groupId);
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
        // **A read now needs an identity, which it did not before (M5).**
        //
        // Not a new permission so much as a newly answerable question: with one
        // policy document, "print the policy" had an unambiguous subject. With a
        // document per organisation it does not, and the only honest source for
        // *which* is the signed-in account — the same rule the HTTP surface
        // applies in `requireGroup`. `() => true` is the viewer tier: any
        // signed-in account may read its own organisation's rulebook.
        const actor = await requireCliActor(defaultRuntime, "read an agent's policy", () => true);
        if (!actor) {
          return;
        }
        const view = agentPolicyView(await loadPolicy(actor.groupId), agentId);
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
        const actor = await requireCliActor(
          defaultRuntime,
          "see which agents a rule binds",
          () => true,
        );
        if (!actor) {
          return;
        }
        const doc = await loadPolicy(actor.groupId);
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
        await setMode(actor.groupId, mode, actor);
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
        await setAskMode(actor.groupId, mode, actor);
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
            ruleActor.groupId,
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
        const removed = await removeRule(actor.groupId, id, actor);
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
          await setAgentAskMode(actor.groupId, agentId, undefined, actor);
          defaultRuntime.log(`agent "${agentId}" now follows the installation default`);
          return;
        }
        assertAskMode(mode);
        await setAgentAskMode(actor.groupId, agentId, mode, actor);
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
          await setAgentMode(actor.groupId, agentId, undefined, actor);
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
        await setAgentMode(actor.groupId, agentId, mode, actor);
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
        await setHitlTimeout(actor.groupId, Math.round(value), actor);
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
