// Governance command registration: inspect/edit the policy document, read the
// tamper-evident audit ledger, and trigger the kill switch from the terminal.
import type { Command } from "commander";
import { listActiveSessions } from "../../governance/active-sessions.js";
import { CLI_ACTOR } from "../../governance/admin-audit.js";
import { tailLedger, verifyLedgerChain } from "../../governance/audit-ledger.js";
import { lockDownAgent, releaseAgentLockdown } from "../../governance/kill-switch.js";
import { decidePendingDecision, listPendingDecisions } from "../../governance/pending-decisions.js";
import {
  addRuleChecked,
  loadPolicy,
  removeRule,
  setAgentAskMode,
  setAgentMode,
  setAskMode,
  setHitlTimeout,
  setMode,
} from "../../governance/policy-store.js";
import type { AskMode, GovernanceMode, ResourceKind } from "../../governance/policy-types.js";
import {
  describeRuleRisks,
  isRuleAccess,
  isRuleEffect,
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
            CLI_ACTOR,
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
    .command("set-agent-mode <agentId> <mode>")
    .description("Per-agent posture, for observing one agent: enforce | monitor | default")
    .action(async (agentId: string, mode: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        if (mode === "default") {
          await setAgentMode(agentId, undefined, CLI_ACTOR);
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
        await setAgentMode(agentId, mode, CLI_ACTOR);
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
        await setHitlTimeout(Math.round(value), CLI_ACTOR);
        defaultRuntime.log(`escalation timeout set to ${Math.round(value)}s`);
      });
    });

  // ---------------------------------------------------------------------
  // Talking to an agent (backlog item A1).
  //
  // The dashboard is the surface the paper describes, but the capability is
  // not Gateway-owned — running a prompt needs the agent stack and nothing
  // else — so it is offered here too. The honest caveat is attribution: the
  // CLI has no login, so a prompt sent from a terminal is recorded against
  // `cli` rather than a person (known limitation A6). The dashboard is the
  // surface that answers "who asked".
  // ---------------------------------------------------------------------
  const agent = governance.command("agent").description("Interact with a governed agent");

  agent
    .command("prompt <agentId> <message...>")
    .description("Send a prompt to an agent and print its reply")
    .option("--stream", "print the reply as it is produced, instead of at the end")
    .action(async (agentId: string, messageParts: string[], options: { stream?: boolean }) => {
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
        let printed = 0;
        try {
          const outcome = await promptAgent({
            agentId,
            username: CLI_ACTOR,
            message: messageParts.join(" "),
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
    });

  agent
    .command("transcript <agentId>")
    .description("Print this machine's conversation with an agent")
    .option("--limit <n>", "number of turns", "50")
    .action(async (agentId: string, options: { limit: string }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { readConversation } = await import("../../governance/agent-conversation.js");
        const limit = Number(options.limit);
        const turns = await readConversation(agentId, CLI_ACTOR);
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
