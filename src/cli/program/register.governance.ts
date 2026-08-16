// Governance command registration: inspect/edit the policy document, read the
// tamper-evident audit ledger, and trigger the kill switch from the terminal.
import type { Command } from "commander";
import { listActiveSessions } from "../../governance/active-sessions.js";
import { CLI_ACTOR } from "../../governance/admin-audit.js";
import { tailLedger, verifyLedgerChain } from "../../governance/audit-ledger.js";
import { lockDownAgent, releaseAgentLockdown } from "../../governance/kill-switch.js";
import { decidePendingDecision, listPendingDecisions } from "../../governance/pending-decisions.js";
import {
  addRule,
  loadPolicy,
  removeRule,
  setAgentAskMode,
  setAskMode,
  setHitlTimeout,
  setMode,
} from "../../governance/policy-store.js";
import type { AskMode, GovernanceMode, ResourceKind } from "../../governance/policy-types.js";
import { detectRuleConflicts } from "../../governance/rule-conflicts.js";
import {
  describeRuleRisks,
  resolveRuleTtl,
  validateRulePattern,
} from "../../governance/rule-validation.js";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";

export function registerGovernanceCommands(program: Command): void {
  const governance = program
    .command("governance")
    .description("Policy-based governance layer: default-deny tool policy and audit ledger");

  const policy = governance.command("policy").description("Inspect or edit the policy document");

  policy
    .command("show")
    .description("Print the current policy document")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        defaultRuntime.log(JSON.stringify(await loadPolicy(), null, 2));
      });
    });

  policy
    .command("set-mode <mode>")
    .description("Set posture: enforce | monitor | off")
    .action(async (mode: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        assertGovernanceMode(mode);
        await setMode(mode, CLI_ACTOR);
        defaultRuntime.log(`mode set to ${mode}`);
      });
    });

  policy
    .command("set-ask <mode>")
    .description("Set ask-on-miss behavior: off | on-miss")
    .action(async (mode: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        assertAskMode(mode);
        await setAskMode(mode, CLI_ACTOR);
        defaultRuntime.log(`ask set to ${mode}`);
      });
    });

  policy
    .command("add-rule")
    .description("Add an allow rule")
    .requiredOption("--kind <kind>", "command | path | network")
    .requiredOption("--pattern <regex>", "regular expression tested against the resource")
    .option("--description <text>", "human-readable note")
    .option("--ttl-minutes <n>", "expire this rule after N minutes (omit for indefinite)")
    .option("--agent <agentId>", "scope the rule to one agent (omit for all agents)")
    .action(
      async (options: {
        kind: string;
        pattern: string;
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
          const expiresAt = ttl.expiresAt;
          const agentId = options.agent?.trim();
          // Earlier rules win: report the clash rather than silently letting
          // the operator believe a restriction took hold that did not.
          const conflicts = detectRuleConflicts((await loadPolicy()).rules, {
            resourceKind: options.kind,
            pattern: validated.pattern,
            ...(agentId ? { agentId } : {}),
            ...(expiresAt ? { expiresAt } : {}),
          });
          const rule = await addRule(
            {
              resourceKind: options.kind,
              pattern: validated.pattern,
              ...(options.description ? { description: options.description } : {}),
              ...(expiresAt ? { expiresAt } : {}),
              ...(agentId ? { agentId } : {}),
            },
            CLI_ACTOR,
          );
          defaultRuntime.log(JSON.stringify(rule, null, 2));
          for (const risk of describeRuleRisks(validated.pattern, options.kind)) {
            defaultRuntime.log(`warning: ${risk.message}`);
          }
          for (const conflict of conflicts) {
            defaultRuntime.log(
              `warning: an earlier rule already covers this (${conflict.existingPattern}) — ${conflict.message}`,
            );
          }
        });
      },
    );

  policy
    .command("remove-rule <id>")
    .description("Remove a rule by id")
    .action(async (id: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const removed = await removeRule(id, CLI_ACTOR);
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
        if (mode === "default") {
          await setAgentAskMode(agentId, undefined, CLI_ACTOR);
          defaultRuntime.log(`agent "${agentId}" now follows the installation default`);
          return;
        }
        assertAskMode(mode);
        await setAgentAskMode(agentId, mode, CLI_ACTOR);
        defaultRuntime.log(`agent "${agentId}" ask set to ${mode}`);
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
        await setHitlTimeout(Math.round(value), CLI_ACTOR);
        defaultRuntime.log(`escalation timeout set to ${Math.round(value)}s`);
      });
    });

  governance
    .command("sessions")
    .description("List agent sessions currently running")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const policy = await loadPolicy();
        // The CLI has no governance login, so it reports with full visibility;
        // its boundary is filesystem access, not RBAC (see CLI-REFERENCE.md).
        const view = listActiveSessions({
          actor: { username: "cli", role: "root", assignedAgents: [] },
          lockedAgents: policy.lockedAgents,
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
