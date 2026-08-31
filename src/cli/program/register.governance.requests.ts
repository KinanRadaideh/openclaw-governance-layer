// The rule-request queue's command-line surface (T40).
//
// **One file, one subject** — the seam every governance command module is split
// along: *everything here submits to, reads, or decides the rule-request queue.*
//
// ## Why this was the last surface gap, and why the reason for leaving it was
// the weakest of the four
//
// `CLI-REFERENCE.md` §2d recorded two capabilities as deliberately
// dashboard-only. The argument for this one was flagged as the weaker at the
// time it was written: the obvious case — *a rule request is a conversation
// between two people, which a scriptable surface serves badly* — is contradicted
// by `governance pending list` and `pending decide`, which are exactly that
// shape for timed-out escalations and have existed since T5.
//
// What survived was narrower and real: an Administrator at a terminal could
// already write the rule with `policy add-rule`, so the gap cost the **link**
// between a request and the rule it produced, not the capability. That link is
// the whole audit value of the queue. Granting a request by hand leaves
// `createdRuleId` unset, the requester's row pending for ever, and two ledger
// entries — a submit and an unrelated rule-add — that nothing joins.
//
// ## The authorization is the routes', deliberately not a re-derivation
//
// Each command asks the question its HTTP counterpart asks, through the same
// `permissions.ts` helpers:
//
//   - **list** — Viewer and above, filtered by `canViewAgent`. A request with no
//     agent is installation-wide and visible to anyone who can read the queue.
//     Unscoped, the queue lets an account limited to one agent enumerate every
//     other agent's id, the patterns being asked for, and the free-text reasons
//     — which routinely name internal hosts and paths.
//   - **submit** — User and above, and `canManageAgent` for an agent-scoped
//     request. Requesting is not authoring, so this is `canManageAgent` rather
//     than `canAuthorPolicyForAgent`: a User whose Root has withheld authoring
//     may still ask, and asking is precisely the fallback withholding leaves
//     them.
//   - **decide** — Administrator and above, matching the floor that keeps the
//     security property intact: no privilege is ever created by a
//     non-Administrator.
//
// Two surfaces answering one question two ways is this project's most-found
// defect, and a parity task that introduced one would be self-defeating.
import type { Command } from "commander";
import { toCliActor } from "../../governance/cli-identity.js";
import { canManageAgent, canViewAgent } from "../../governance/permissions.js";
import {
  addRule,
  setAgentAskMode,
  setAgentMode,
  TooManyRulesError,
} from "../../governance/policy-store.js";
import { roleAtLeast } from "../../governance/roles.js";
import {
  attachCreatedRule,
  decideRuleRequest,
  describeRequest,
  findPendingRuleRequest,
  listRuleRequests,
  reopenRuleRequest,
  submitRuleRequest,
  type RuleRequest,
} from "../../governance/rule-requests.js";
import { validateRulePattern } from "../../governance/rule-validation.js";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { requireCliIdentity } from "./governance-cli-gate.js";

/** One line per request, in the order an Administrator reads them. */
function summarise(request: RuleRequest): string {
  const scope = request.agentId ? `agent ${request.agentId}` : "all agents";
  const decided = request.decidedBy ? ` by ${request.decidedBy}` : "";
  return (
    `${request.id}  [${request.status}${decided}]  ${request.requestedBy} → ${scope}\n` +
    `    ${describeRequest(request)}` +
    (request.createdRuleId ? `\n    granted as rule ${request.createdRuleId}` : "")
  );
}

export function registerGovernanceRuleRequestCommands(governance: Command): void {
  const requests = governance
    .command("requests")
    .description("The rule-request queue: what Users have asked for, and deciding it");

  requests
    .command("list")
    .description("Show the queue, scoped to the agents you can see")
    .option("--pending", "show only requests nobody has decided yet")
    .action(async (options: { pending?: boolean }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        // Viewer and above, matching `rule-requests` GET. The queue is
        // oversight information: who asked for what, and what was granted.
        const identity = await requireCliIdentity(
          defaultRuntime,
          "read the rule-request queue",
          () => true,
        );
        if (!identity) {
          return;
        }
        const groupId = identity.groupId?.trim();
        if (!groupId) {
          defaultRuntime.log(
            "Your account does not belong to an organisation, so it cannot read " +
              "governance data. Ask a Root to assign it to one.",
          );
          return;
        }
        const actor = toCliActor(identity);
        const visible = (await listRuleRequests(groupId))
          .filter(
            (request) => request.agentId === undefined || canViewAgent(actor, request.agentId),
          )
          .filter((request) => !options.pending || request.status === "pending");
        if (visible.length === 0) {
          // Said in words rather than printed as an empty list. "Nothing is
          // waiting" is a real answer an operator checks for deliberately, and
          // an empty array is indistinguishable from a failed read — the defect
          // finding 102 was, and finding 117 nearly repeated.
          defaultRuntime.log(
            options.pending
              ? "No requests are waiting for a decision."
              : "No rule requests have been made here.",
          );
          return;
        }
        for (const request of visible) {
          defaultRuntime.log(summarise(request));
        }
      });
    });

  requests
    .command("submit")
    .description("Ask an Administrator to allow something you are currently denied")
    .requiredOption("--kind <kind>", "command | path | network")
    .requiredOption("--pattern <regex>", "regular expression tested against the resource")
    .requiredOption("--reason <reason>", "Why you need it; an Administrator reads this")
    .option("--agent <agentId>", "scope the request to one agent (omit to ask for all agents)")
    .action(async (options: { kind: string; pattern: string; reason: string; agent?: string }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        if (options.kind !== "command" && options.kind !== "path" && options.kind !== "network") {
          defaultRuntime.log(`Invalid kind "${options.kind}". Expected command, path or network.`);
          defaultRuntime.exit(1);
          return;
        }
        // The same validator the dashboard and `policy add-rule` use, so the
        // command line cannot file a request nobody could ever grant — length,
        // compilability and backtracking safety are checked at submit rather
        // than discovered by the Administrator at approval.
        const validated = validateRulePattern(options.pattern);
        if (!validated.ok) {
          defaultRuntime.log(validated.error);
          defaultRuntime.exit(1);
          return;
        }
        if (!options.reason.trim()) {
          // A request an Administrator cannot evaluate is not a request.
          defaultRuntime.log("reason is required so an administrator can judge the request");
          defaultRuntime.exit(1);
          return;
        }
        const agentId = options.agent?.trim();
        const identity = await requireCliIdentity(
          defaultRuntime,
          agentId ? `request access for agent "${agentId}"` : "submit a rule request",
          (actor) => (agentId ? canManageAgent(actor, agentId) : roleAtLeast(actor.role, "user")),
        );
        if (!identity) {
          return;
        }
        const groupId = identity.groupId?.trim();
        if (!groupId) {
          defaultRuntime.log(
            "Your account does not belong to an organisation, so it cannot file a request.",
          );
          return;
        }
        try {
          const request = await submitRuleRequest(groupId, {
            resourceKind: options.kind,
            pattern: validated.pattern,
            // Clamped exactly as the route clamps it. A limit enforced on one
            // surface and not the other is a limit that does not exist.
            reason: options.reason.slice(0, 500),
            requestedBy: identity.username,
            requestedByRole: identity.role,
            ...(agentId ? { agentId } : {}),
          });
          defaultRuntime.log(`submitted ${request.id}: ${describeRequest(request)}`);
          defaultRuntime.log("An Administrator must approve it before it takes effect.");
        } catch (err) {
          // The per-user pending cap arrives here as a plain message.
          defaultRuntime.log(err instanceof Error ? err.message : "could not submit request");
          defaultRuntime.exit(1);
        }
      });
    });

  requests
    .command("decide <id>")
    .description("Administrator: approve a request (creating the rule) or reject it")
    .option("--approve", "grant it — writes the rule or applies the setting")
    .option("--reject", "refuse it — records the decision and creates nothing")
    .action(async (id: string, options: { approve?: boolean; reject?: boolean }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        if (Boolean(options.approve) === Boolean(options.reject)) {
          throw new Error("specify exactly one of --approve or --reject");
        }
        const approve = Boolean(options.approve);
        const identity = await requireCliIdentity(
          defaultRuntime,
          "decide a rule request",
          (actor) => roleAtLeast(actor.role, "administrator"),
        );
        if (!identity) {
          return;
        }
        const groupId = identity.groupId?.trim();
        if (!groupId) {
          defaultRuntime.log(
            "Your account does not belong to an organisation, so it cannot decide a request.",
          );
          return;
        }
        const pending = await findPendingRuleRequest(groupId, id);
        if (!pending) {
          defaultRuntime.log(`no pending request with id ${id}`);
          defaultRuntime.exit(1);
          return;
        }
        // Claim the decision **before** creating the rule, the ordering the
        // route's own comment argues for: the reverse let two administrators
        // both pass the pending check and both create a rule, leaving a
        // duplicate permission, an orphaned rule nothing referenced, and a
        // success message for the one whose approval did not take.
        const decided = await decideRuleRequest(groupId, {
          id,
          approve,
          decidedBy: identity.username,
          decidedByRole: identity.role,
        });
        if (!decided) {
          defaultRuntime.log("That request was already decided by someone else.");
          defaultRuntime.exit(1);
          return;
        }
        if (!approve) {
          defaultRuntime.log(`rejected ${decided.id}`);
          return;
        }
        const auditActor = { name: identity.username, role: identity.role };
        if (decided.kind === "agent-setting") {
          // Applied from the **stored** request, never from anything typed at
          // this terminal: an Administrator must grant what was reviewed.
          try {
            if (decided.setting === "ask") {
              await setAgentAskMode(groupId, decided.agentId!, decided.value as never, auditActor);
            } else {
              await setAgentMode(groupId, decided.agentId!, decided.value as never, auditActor);
            }
          } catch (err) {
            await reopenRuleRequest(groupId, id);
            defaultRuntime.log(err instanceof Error ? err.message : "could not apply the setting");
            defaultRuntime.exit(1);
            return;
          }
          defaultRuntime.log(`approved ${decided.id}: ${describeRequest(decided)}`);
          return;
        }
        try {
          const rule = await addRule(
            groupId,
            {
              resourceKind: decided.resourceKind!,
              pattern: decided.pattern!,
              // Grant exactly the scope that was requested and reviewed.
              // Dropping this turned every approval into a global rule.
              ...(decided.agentId ? { agentId: decided.agentId } : {}),
              description: `Requested by ${decided.requestedBy}: ${decided.reason}`,
              createdBy: identity.username,
            },
            auditActor,
          );
          // The link this command exists for. Without it the request is
          // approved and nothing joins it to the permission it produced.
          await attachCreatedRule(groupId, id, rule.id);
          defaultRuntime.log(`approved ${decided.id}, granted as rule ${rule.id}`);
        } catch (err) {
          // The decision is claimed but the permission does not exist. Putting
          // the request back is the only state that stays true: otherwise the
          // requester is told yes, still cannot act, and no Administrator sees
          // it in the queue any more.
          await reopenRuleRequest(groupId, id);
          if (err instanceof TooManyRulesError) {
            defaultRuntime.log(err.message);
            defaultRuntime.exit(1);
            return;
          }
          throw err;
        }
      });
    });
}
