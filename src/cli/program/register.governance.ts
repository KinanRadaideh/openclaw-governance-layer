// Governance command registration: inspect/edit the policy document, read the
// tamper-evident audit ledger, and trigger the kill switch from the terminal.
import type { Command } from "commander";
import { listActiveSessions } from "../../governance/active-sessions.js";
import { CLI_ACTOR } from "../../governance/admin-audit.js";
import { listAgents } from "../../governance/agent-registry.js";
import { tailLedger, verifyLedgerChain } from "../../governance/audit-ledger.js";
import { auditLoginFailure, auditLoginSuccess, auditLogout } from "../../governance/auth-audit.js";
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
  canManageAccounts,
  canManageAgent,
  canManageGlobalPolicy,
  canReadDeploymentReport,
  canViewAgent,
} from "../../governance/permissions.js";
import { loadPolicy } from "../../governance/policy-store.js";
import { roleAtLeast } from "../../governance/roles.js";
import { updateSessionsPolicyAuthoring } from "../../governance/session-tokens.js";
import { issueSession } from "../../governance/session-tokens.js";
import {
  deleteUnmigratedAccounts,
  listUnmigratedAccounts,
  setUserPolicyAuthoring,
} from "../../governance/user-store.js";
import { authenticate, listUsers } from "../../governance/user-store.js";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { promptSecret, promptText } from "../prompt.js";
import { requireCliActor, requireCliIdentity, requireManagedAgent } from "./governance-cli-gate.js";
import { registerGovernanceAgentCommands } from "./register.governance.agents.js";
import { registerGovernanceBackendCommands } from "./register.governance.backend.js";
import { registerGovernanceOrganisationCommands } from "./register.governance.organisation.js";
import { registerGovernancePolicyCommands } from "./register.governance.policy.js";
import { registerGovernanceRuleRequestCommands } from "./register.governance.requests.js";

export function registerGovernanceCommands(program: Command): void {
  const governance = program
    .command("governance")
    .description("Policy-based governance layer: default-deny tool policy and audit ledger");

  // ---------------------------------------------------------------------
  // Identity (T5). Before this, every command-line change was recorded against
  // the literal actor `cli` and no tier was checked at all, so the audit trail
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
          // Recorded here as it is on the route (finding 226). `auth-audit.ts`
          // exists because "who was in the system, and when?" had no answer, and
          // names ISO 27001 and OWASP for logging failures as well as successes;
          // this surface recorded the success and dropped the failure, so a
          // password guessed from a shell left nothing behind at all.
          //
          // No attempt count is passed. The throttle is per-process in-memory
          // state belonging to the Gateway, so a command run in a fresh process
          // cannot know how many times this account has been tried, and claiming
          // a repeat it cannot substantiate would spend the reserve finding 107
          // built for repeats it can.
          await auditLoginFailure(name);
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

  governance
    .command("accounts")
    .description("Root: the accounts in your organisation, with the ids other commands need")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        // **Root and group-scoped, exactly as `route === "users"` is.** That
        // route's own comment says why the scope is not optional: a Root owns
        // one organisation rather than the installation, and the account list
        // is the most direct way isolation could leak, because it names every
        // person in it.
        const actor = await requireCliActor(defaultRuntime, "list accounts", (a) =>
          canManageAccounts(a),
        );
        if (!actor) {
          return;
        }
        const accounts = await listUsers(actor.groupId);
        if (accounts.length === 0) {
          // In words rather than as nothing: "no accounts" and "the command
          // failed" are indistinguishable when both render blank (finding 117).
          defaultRuntime.log("no accounts in this organisation");
          return;
        }
        // The id first, because the id is the reason this command exists.
        for (const account of accounts) {
          const managed = account.managedBy ? `, managed by ${account.managedBy}` : "";
          const withheld = account.canAuthorPolicy === false ? ", policy authoring withheld" : "";
          defaultRuntime.log(
            `  ${account.id}  ${account.username} (${account.role})${managed}${withheld}`,
          );
        }
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
        // **`actor.groupId`, which this command did not pass until finding
        // 234.** `requireCliActor` returns the caller's organisation precisely
        // so a command cannot "obtain permission to act and then quietly act on
        // a different organisation's files", its own words, and this was the
        // one account command that took the permission and dropped the group.
        // The HTTP route refuses a foreign account id with a 404; the command
        // accepted it and wrote.
        const ok = await setUserPolicyAuthoring(userId, allowed === "true", actor, actor.groupId);
        defaultRuntime.log(
          ok
            ? `policy authoring ${allowed === "true" ? "allowed" : "withheld"} for ${userId}`
            : `no account with id ${userId}`,
        );
        // The sessions file is the other half; without it a signed-in User keeps
        // the old permission until their session expires.
        //
        // **Only when the write happened.** `updateSessionsPolicyAuthoring`
        // takes an account id and no group, so calling it unconditionally
        // rewrote the live session of an account the write above had just
        // refused. The same cross-organisation reach, one layer along.
        if (ok) {
          await updateSessionsPolicyAuthoring(userId, allowed === "true");
        }
      });
    });

  const groups = governance
    .command("groups")
    .description("Groups: the isolated worlds accounts belong to (M3)");

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
          // recovery is a password nobody has, so the destructive form has to
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
        // who *can* sign in, which is precisely the state this repairs, so the
        // command still runs, attributed to the command line itself.
        const identity = await currentCliIdentity();
        const removed = await deleteUnmigratedAccounts(
          // **Finding 161.** This read `{ name: "cli", role: "root" }`, so a
          // destructive account deletion was recorded as the act of a **Root**
          //. A tier no authenticated account held, on the one code path that
          // exists precisely because nobody can sign in. `AuditActorInput`'s
          // own doc forbids it in as many words: the labelled actors "are not
          // accounts and hold no role, and supplying one would invent an
          // authority that never existed."
          //
          // Inventing an authority is worse than recording none. An entry
          // saying `unknown` or `cli` announces that attribution is missing
          // and invites the question; an entry saying `root` answers it,
          // wrongly, and nothing downstream can tell it from the real thing.
          identity ? toCliAuditActor(identity) : CLI_ACTOR,
        );
        defaultRuntime.log(`deleted ${removed} account(s) that predated groups`);
      });
    });

  // The agent registry (M4) lives in its own module: it added a command group
  // to a file already 163 lines past the project's 700-line limit (T16), and
  // the seam is the same one the HTTP routes were split along, one file, one
  // statable authorization rule.
  // The policy document's commands live in their own module for the reason the
  // agent-registry commands do: one file, one subject, and this file was 848
  // code lines against a 700 limit (T16).
  registerGovernancePolicyCommands(governance);

  registerGovernanceAgentCommands(governance);

  // The Root half of the two-layer Codex control (§3.5.62). Its per-agent
  // counterpart lives with the other agent commands above; this one is about
  // the installation, and its own module for the same reason theirs is.
  registerGovernanceBackendCommands(governance);

  // The rule-request queue (T40). The User tier's escalation path, and the
  // last capability `CLI-REFERENCE.md` §2d listed as deliberately
  // dashboard-only. Its own module for the same reason as the three above: the
  // queue is one subject, and it is the only one whose three commands sit at
  // three different tiers.
  registerGovernanceRuleRequestCommands(governance);

  // Deleting the organisation, including the Root running the command. Its own
  // module because it is the only capability in the tree whose authorization
  // rule is an identity rather than a tier. See its header.
  registerGovernanceOrganisationCommands(governance);

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
          const actor = await requireCliActor(defaultRuntime, "prompt an agent", () => true);
          if (!actor) {
            return;
          }
          // ---------------------------------------------------------------
          // **Authorization before anything expensive (2026-09-01).**
          //
          // These four checks used to sit *below* the agent-stack import, so a
          // caller who was about to be refused still paid for loading the whole
          // agent runtime first. Wrong on its own terms, a cheap check belongs
          // before costly work, and an authorization check especially, and it
          // had a measurable cost: the refusal tests in
          // `cli-agent-control-parity.test.ts` each imported the agent stack to
          // reach a decision made without it, and one of them timed out at 120
          // seconds under load. That is this project's fourth load-sensitive
          // test (findings 145, 146 and T30's rotation pair are the others),
          // and T30 settled how to answer them: fix the seam, do not widen the
          // timeout.
          //
          // The conversation belongs to the account, not to the machine. Before
          // T5 every CLI prompt was owned by `cli`, so two operators on one host
          // shared a transcript and the ledger could not say which of them set
          // the agent going.
          // ---------------------------------------------------------------
          const promptIdentity = await currentCliIdentity();
          if (!promptIdentity) {
            defaultRuntime.log("Not signed in. Run `openclaw governance login` first.");
            return;
          }
          if (!canManageAgent(toCliActor(promptIdentity), agentId)) {
            defaultRuntime.log(`You do not manage agent "${agentId}".`);
            return;
          }
          // And that it is this organisation's agent, which `canManageAgent`
          // cannot answer: an Administrator's scope is unlimited *within their
          // own group*, so the predicate returns true for any id at all. The
          // route pairs it with `requireAgentInGroup` for exactly this reason.
          const { findAgent: findRegisteredAgent } =
            await import("../../governance/agent-registry.js");
          if ((await findRegisteredAgent(agentId))?.groupId !== actor.groupId) {
            defaultRuntime.log(`You do not manage agent "${agentId}".`);
            defaultRuntime.exit(1);
            return;
          }

          // Registered lazily, on use. Importing the agent stack at module load
          // would make every `openclaw governance ...` invocation, including
          // `policy show`, pay for a capability almost none of them need.
          const { installGovernanceAgentRunner } =
            await import("../../agents/governance-agent-runner.js");
          installGovernanceAgentRunner();
          const { promptAgent } = await import("../../governance/agent-conversation.js");

          // Ctrl-C cancels the run rather than only killing the printout.
          //
          // **This is the only way to stop a run started here**, and the reason
          // is architectural: the in-flight run table is per **process**, and
          // this command runs the agent in its own. `governance agent cancel`
          // exists as of T34, but it reaches the *Gateway's* run registry. It
          // can stop a run somebody started from the dashboard and cannot see
          // this one at all. (This comment said "there is no
          // `governance agent cancel` command" for a day after T34 added one.)
          const interrupted = new AbortController();
          const onSigint = () => interrupted.abort();
          process.once("SIGINT", onSigint);

          // Streaming is opt-in here, unlike the dashboard.
          //
          // A terminal is often reading into a pipe or a file, where partial
          // snapshots would be written repeatedly and the output would no longer
          // be the reply. Printing once at the end is the correct default for a
          // command; `--stream` is for watching a long task by hand.
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
              const stored = await storeAttachment(actor.groupId, {
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
              await markAttachmentUsed(actor.groupId, stored.sha256);
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
            const outcome = await promptAgent(actor.groupId, {
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
                      // unprint, so it starts a fresh line rather than silently
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
    .command("runs")
    .description("Prompt runs in flight, and who started them")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        // **Tier floor User, matching `agent/runs`, and until finding 235 this
        // said so and passed `() => true`.** A Viewer was admitted by the check
        // and then excluded by accident, because `includeOthers` is false at
        // that tier and a Viewer cannot start a run to own one. A control that
        // holds because a second filter happens to cover it is not a control.
        const identity = await requireCliIdentity(defaultRuntime, "list runs", (a) =>
          roleAtLeast(a.role, "user"),
        );
        if (!identity) {
          return;
        }
        const groupId = identity.groupId?.trim();
        if (!groupId) {
          defaultRuntime.log("Your account does not belong to an organisation.");
          return;
        }
        const { listPromptRuns } = await import("../../governance/prompt-runs.js");
        const { listAgents: listGroupAgents } = await import("../../governance/agent-registry.js");
        const scope = toCliActor(identity);
        const runs = listPromptRuns({
          username: identity.username,
          includeOthers: canManageGlobalPolicy(scope),
          // The isolation boundary (finding 235). `canManageAgent` below narrows
          // a User to their assigned agents; it is unconditionally true above
          // that tier, so it was never the thing keeping one organisation's runs
          // out of another's list.
          groupAgentIds: (await listGroupAgents(groupId)).map((entry) => entry.id),
        }).filter((run) => canManageAgent(scope, run.agentId));
        if (runs.length === 0) {
          // In words, for the reason `agents list` gives: an empty list and a
          // failed request look identical when both render as nothing.
          //
          // **And the second line is finding 238.** `prompt-runs.ts` keeps its
          // table in a module-level `Map`, so it is per **process**. Measured,
          // not reasoned: a parent holding a run and a child process started
          // from it see `["gov-run-probe"]` and `[]` respectively. Every
          // invocation of this command is a fresh process, so it can only ever
          // see runs begun in its own, and the runs an operator cares about
          // live in the Gateway. Saying "no runs are in flight" alone is
          // therefore a true statement about this process and a false
          // impression about the installation.
          defaultRuntime.log("no runs are in flight in this process");
          defaultRuntime.log(
            "  This command cannot see runs started by the Gateway or the dashboard:",
          );
          defaultRuntime.log(
            "  the in-flight table lives in the process running them. Use the dashboard,",
          );
          defaultRuntime.log("  or `openclaw governance kill <agentId>` to stop the agent itself.");
          return;
        }
        for (const run of runs) {
          const age = Math.round((Date.now() - run.startedAt) / 1000);
          defaultRuntime.log(`  ${run.runId}  ${run.agentId}  by ${run.username}  ${age}s`);
        }
      });
    });

  agent
    .command("cancel <runId>")
    .description("Stop one prompt run without locking the agent down")
    .action(async (runId: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        // **Narrower than the kill switch on purpose.** `governance kill` stops
        // an agent and keeps it stopped; this ends one run and leaves the agent
        // working. During an incident an operator wants both, and having only
        // the blunt one on this surface pushed them toward it.
        // The route's User floor, which this command did not have (finding 235).
        const identity = await requireCliIdentity(defaultRuntime, "cancel a run", (a) =>
          roleAtLeast(a.role, "user"),
        );
        if (!identity) {
          return;
        }
        const groupId = identity.groupId?.trim();
        if (!groupId) {
          defaultRuntime.log("Your account does not belong to an organisation.");
          return;
        }
        const { cancelPromptRun } = await import("../../governance/prompt-runs.js");
        const { listAgents: listGroupAgents } = await import("../../governance/agent-registry.js");
        const outcome = cancelPromptRun({
          runId: runId.trim(),
          username: identity.username,
          // Cancelling somebody else's run is an operator act, not an ordinary
          // one. The same split the HTTP route draws.
          mayCancelOthers: canManageGlobalPolicy(toCliActor(identity)),
          groupAgentIds: (await listGroupAgents(groupId)).map((entry) => entry.id),
        });
        if (outcome.cancelled) {
          defaultRuntime.log(`cancelled ${runId}`);
          return;
        }
        if (outcome.reason !== "not-found") {
          defaultRuntime.log(`run "${runId}" belongs to another account`);
          return;
        }
        // Finding 238, and the reason this says more than "no such run". The
        // run table is per process, so a run id minted by the Gateway is never
        // in this process's table and the honest answer is "I cannot see it",
        // not "it does not exist". `CLI-REFERENCE.md` argued in its own prose
        // that a command which "looked like it could reach the Gateway's runs
        // would be reporting a power it does not have", and then the command
        // was built without that paragraph being revisited.
        defaultRuntime.log(`no run "${runId}" is in flight in this process`);
        defaultRuntime.log(
          "  This command cannot reach runs started by the Gateway or the dashboard.",
        );
        defaultRuntime.log(
          "  Cancel those from the dashboard, or stop the agent with `governance kill`.",
        );
      });
    });

  agent
    .command("transcript <agentId>")
    // "your account's", not "this machine's" (finding 219). T5 moved
    // conversations from being owned by `cli` to being owned by the signed-in
    // account, the comment in `prompt` above records the change, and this
    // string, the reference table row and the reference prose all kept the old
    // model. The prose went further and told operators the command line and the
    // dashboard were separate threads, which stopped being true at the same
    // moment: the same account sees one conversation on both.
    .description("Print your account's conversation with an agent")
    .option("--limit <n>", "number of turns", "50")
    .action(async (agentId: string, options: { limit: string }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const { readConversation } = await import("../../governance/agent-conversation.js");
        const limit = Number(options.limit);
        // **The route's four checks, which this command made two of** (finding
        // 216). `agent/transcript` requires the User floor, a group,
        // `canManageAgent` and `requireAgentInGroup`; this asked only for a
        // signed-in account holding a group, so a Viewer could read a
        // transcript their tier cannot produce and a User could read one for an
        // agent nobody assigned them. `requireManagedAgent` is the command
        // line's half of that set and is what `kill` already uses. The gap was
        // that this command was written before it existed and never moved onto
        // it.
        const reader = await requireManagedAgent(
          defaultRuntime,
          `read agent "${agentId}"'s transcript`,
          agentId,
        );
        if (!reader) {
          return;
        }
        const turns = await readConversation(reader.groupId, agentId, reader.name);
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
  // plain SSH session *before* any tunnel exists. When the dashboard is, by
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
        // **Root, as the route is.** `governance-privilege-matrix.test.ts` writes
        // the reason out: this report gives the bind mode, port, gateway auth
        // mode and governance directory. A map of how to reach and attack the
        // installation. The command's own comment above argues that the
        // *surface* must exist here, because §1.6 expects the dashboard to be
        // reachable only through an SSH tunnel and this is what you run before
        // one exists. That argument says nothing about the tier, and until
        // 2026-08-31 the command handed the map to any signed-in account.
        const actor = await requireCliActor(defaultRuntime, "read the deployment report", (a) =>
          canReadDeploymentReport(a),
        );
        if (!actor) {
          return;
        }
        // Lazy: these pull in the security audit and the config loader, and
        // `governance policy show` should not pay for them.
        const { resolveDeploymentEnvironmentInput } =
          await import("../../gateway/governance-deployment-input.js");
        const { readDeploymentStatus } = await import("../../governance/deployment-status.js");
        const { getRuntimeConfig, getRuntimeConfigSourceSnapshot } =
          await import("../../config/config.js");
        const cfg = getRuntimeConfig();
        const status = await readDeploymentStatus(
          actor.groupId,
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
        // non-zero on every developer machine, where the platform check warns
        // and the permission checks cannot run, is a command people learn to
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
        // to enumerate every agent in the installation. The same disclosure
        // the dashboard's own scoping exists to prevent.
        const viewer = await currentCliIdentity();
        if (!viewer) {
          defaultRuntime.log("Not signed in. Run `openclaw governance login` first.");
          return;
        }
        const viewerGroup = viewer.groupId?.trim();
        if (!viewerGroup) {
          defaultRuntime.log("Your account does not belong to an organisation.");
          return;
        }
        const sessionsPolicy = await loadPolicy(viewerGroup);
        const view = listActiveSessions({
          actor: toCliActor(viewer),
          lockedAgents: sessionsPolicy.lockedAgents,
          groupAgentIds: (await listAgents(viewerGroup)).map((record) => record.id),
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

  // **Both commands ask what their routes ask, and did not until 2026-08-31.**
  //
  // They were the last two governance commands gated on `() => true`, any
  // signed-in account, while `pending-decisions` GET and
  // `pending-decisions/decide` each ask two further questions: a **User** floor
  // rather than a Viewer one, and, for the write, `canManageAgent` against the
  // **stored** entry's agent. Two surfaces answering one question two ways is
  // this project's most-found defect, and here it had three separate costs: a
  // Viewer could record a decision, a User could record one on an agent they do
  // not hold, and the read printed the whole organisation's stack, agent ids,
  // tool names and the resources they were blocked on, to accounts that cannot
  // see those agents anywhere else.

  pending
    .command("list")
    .description("Show the pending-decision stack, newest first")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const identity = await requireCliIdentity(
          defaultRuntime,
          "list pending decisions",
          (candidate) => roleAtLeast(candidate.role, "user"),
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
        // Scoped exactly as the GET route scopes it. An unscoped stack is the
        // leak the rule-request queue carries a paragraph about, one file over.
        const actor = toCliActor(identity);
        const visible = (await listPendingDecisions(groupId)).filter((entry) =>
          canViewAgent(actor, entry.agentId),
        );
        if (visible.length === 0) {
          // "Nothing is waiting" is a real answer an operator checks for, and
          // an empty array is indistinguishable from a failed read (finding 117).
          defaultRuntime.log("No escalations are waiting for a decision.");
          return;
        }
        defaultRuntime.log(JSON.stringify(visible, null, 2));
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
        const identity = await requireCliIdentity(
          defaultRuntime,
          "decide a pending decision",
          (candidate) => roleAtLeast(candidate.role, "user"),
        );
        if (!identity) {
          return;
        }
        const groupId = identity.groupId?.trim();
        if (!groupId) {
          defaultRuntime.log(
            "Your account does not belong to an organisation, so it cannot decide " +
              "an escalation. Ask a Root to assign it to one.",
          );
          return;
        }
        // Read the entry *before* deciding, so the agent authorised against is
        // the stored one rather than anything the operator named. The route
        // states the same rule in its own comment.
        const target = (await listPendingDecisions(groupId)).find((entry) => entry.id === id);
        if (!target || target.status !== "pending") {
          defaultRuntime.log(`no pending decision with id ${id}`);
          defaultRuntime.exit(1);
          return;
        }
        if (!canManageAgent(toCliActor(identity), target.agentId)) {
          defaultRuntime.log(`You do not manage agent "${target.agentId}".`);
          defaultRuntime.exit(1);
          return;
        }
        const decided = await decidePendingDecision(groupId, {
          id,
          allow: Boolean(options.allow),
          // The signed-in operator, not the literal `cli`. Finding 149 in a
          // second place, and here it did not merely lose the attribution. T35's
          // guard rejects a *named* actor called `cli`, and the decision is
          // written under a file lock before the ledger entry is appended, so
          // the command changed the state and then threw: a decided escalation
          // with no audit record at all, against requirement #5's "100% of …
          // administrative approvals".
          decidedBy: identity.username,
          decidedByRole: identity.role,
        });
        if (!decided) {
          // Lost a race with another operator between the read and the claim.
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
        const actor = await requireCliActor(defaultRuntime, "read the ledger", () => true);
        if (!actor) {
          return;
        }
        const entries = await tailLedger(actor.groupId, Number(options.limit));
        defaultRuntime.log(JSON.stringify(entries, null, 2));
      });
    });

  audit
    .command("verify")
    .description("Recompute the hash chain and report the first tampered entry, if any")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const actor = await requireCliActor(defaultRuntime, "verify the ledger chain", () => true);
        if (!actor) {
          return;
        }
        const result = await verifyLedgerChain(actor.groupId);
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
        // The kill switch acts on one organisation's agent, so the lockdown and
        // the administrative entry recording it both land in that organisation.
        //
        // **Three checks, and until 2026-08-31 this command made none of them**
        // while its route made all three. A Viewer, strictly read-only
        // oversight in §1.6, could stop any agent and keep it stopped; a User
        // could stop one they were never assigned; and an operator of one
        // organisation could stop another's, which is **finding 144 on a second
        // surface**: the lockdown terminates from the Gateway's
        // installation-wide run registry and `terminateAgentRuns` matches on
        // agent id alone. `requireManagedAgent` asks all three, in the order the
        // route asks them.
        //
        // The release takes the same gate as the lockdown deliberately: an
        // operator who may not stop an agent must not be able to restart one
        // somebody else stopped.
        const killActor = await requireManagedAgent(
          defaultRuntime,
          // The agent is named in the refusal, as the route names it: "you are
          // not permitted" without saying to what leaves an operator guessing
          // whether they typed the wrong id or hold the wrong tier.
          options.release ? `release the lockdown on "${agentId}"` : `stop agent "${agentId}"`,
          agentId,
        );
        if (!killActor) {
          defaultRuntime.exit(1);
          return;
        }
        // Finding 149, both calls passed the literal `"cli"` and threw away the
        // identity resolved two lines above, so the emergency stop was the one
        // administrative action on this surface that could not say who took it.
        // T5 made the command line attributable; this pair of call sites was
        // missed, and `AuditActorInput`'s bare-string arm meant the wrong value
        // still typechecked. `killActor` is `{ name, role, groupId }`, which
        // `requireCliActor` builds to be assignable to `AuditActorInput`.
        if (options.release) {
          await releaseAgentLockdown(killActor.groupId, agentId, killActor);
          defaultRuntime.log(`governance lockdown released for agent "${agentId}"`);
          return;
        }
        const outcome = await lockDownAgent(killActor.groupId, agentId, killActor);
        defaultRuntime.log(
          `governance lockdown engaged for agent "${agentId}" in ${outcome.elapsedMs.toFixed(1)}ms`,
        );
        defaultRuntime.log(
          outcome.termination.supported
            ? `aborted ${outcome.termination.abortedRunIds.length} in-flight run(s)`
            : "no in-flight termination available from the CLI (the Gateway owns the run registry)",
        );
        if (outcome.auditError) {
          // The stop landed; its ledger entry did not (finding 195). Said out
          // loud, because a missing entry in a tamper-evident trail is exactly
          // the thing nobody should discover later as a gap.
          defaultRuntime.log(
            `WARNING: the agent is stopped, but this stop could not be written to the audit ledger: ${outcome.auditError}`,
          );
        }
      });
    });
}
