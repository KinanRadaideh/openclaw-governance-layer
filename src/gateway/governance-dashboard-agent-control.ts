// Acting on an agent you manage: the third split out of
// `governance-dashboard-api.ts` (T16).
//
// One statable authorization rule for the whole file, which is the property
// that makes a split worth doing rather than merely making two files out of
// one:
//
//   *User tier or above, and you must manage this agent.*
//
// Every route here is that pair, `requireRole(..., "user")` followed by
// `canManageAgent`. A Viewer is excluded by tier ("cannot interact with the
// agent"), and a User reaches only the agents assigned to them. The kill switch
// belongs here rather than with policy for the same reason: stopping an agent
// is *acting on a workload you are responsible for*, not changing the rules it
// is judged by. `canManageAgent`, never `canAuthorPolicyForAgent`. The
// distinction T27 drew, where withholding an account's ability to write rules
// must not also take away its ability to stop its own agent.
//
// That leaves the three route modules each answering a different question:
// `-accounts` "who are the people?", `-agents` "which agents exist and whose
// are they?", and this one "what may I do to an agent that is mine?".
import type { IncomingMessage, ServerResponse } from "node:http";
import { lockDownAgent, releaseAgentLockdown } from "../governance/kill-switch.js";
import { isSafeObjectKey } from "../governance/object-keys.js";
import {
  canManageAgent,
  canManageGlobalPolicy,
  type GovernanceActor,
} from "../governance/permissions.js";
import { loadPolicy, setAgentHitlTimeout } from "../governance/policy-store.js";
import { MAX_HITL_TIMEOUT_SECONDS, MIN_HITL_TIMEOUT_SECONDS } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { requireAgentInGroup, requireGroup } from "./governance-dashboard-group.js";
import {
  MAX_JSON_BODY_BYTES,
  readJsonBodyOrError,
  sendInvalidRequest,
  sendJson,
} from "./http-common.js";

/**
 * Body ceiling for a prompt, which is prose rather than a small JSON control
 * message. Deliberately its own constant: raising the shared limit to suit one
 * route would widen the surface every other route accepts.
 */
const MAX_PROMPT_BODY_BYTES = 64 * 1024;

/**
 * How many attachments one prompt may name.
 *
 * The per-file cap and the per-account quota already bound the bytes; this
 * bounds the *work*, because each reference costs an index lookup and each
 * accepted one lengthens the ledger entry describing the prompt. Ten is well
 * above what an operator sends by hand and far below what would make either
 * cost interesting.
 */
const MAX_ATTACHMENTS_PER_PROMPT = 10;

/**
 * Ceiling on an agent id arriving from a caller.
 *
 * Generous, real ids are short, because the point is not to validate the
 * shape of an id but to stop an unbounded string reaching storage that keeps
 * what it is given.
 */
const MAX_AGENT_ID_LENGTH = 200;

/**
 * Whether a header value is well-formed base64 (QA round 17, finding 112).
 *
 * Written as a scan rather than a regular expression because the check has to
 * be exact: `Buffer.from(value, "base64")` never throws and never reports a
 * problem: it discards anything outside the alphabet and returns whatever is
 * left. So this is the only place a malformed name can be caught, and a
 * validator that is itself slightly wrong would hand the difference straight to
 * the ledger.
 */
function isBase64Header(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0) {
    return false;
  }
  // Padding is counted off the end first, then the remainder is checked for
  // alphabet characters only. An earlier version walked forwards and tried to
  // decide, at each "=", whether it was in a legal position, and got the
  // arithmetic wrong by one, rejecting every name whose encoding ends in "==".
  // That is most of them, including every non-ASCII name this validator was
  // added to protect. Caught by the tests written for the finding it fixes.
  let end = value.length;
  let padding = 0;
  while (padding < 2 && end > 0 && value[end - 1] === "=") {
    end -= 1;
    padding += 1;
  }
  if (end === 0) {
    return false;
  }
  for (let at = 0; at < end; at += 1) {
    const ch = value[at] ?? "";
    const ok =
      (ch >= "A" && ch <= "Z") ||
      (ch >= "a" && ch <= "z") ||
      (ch >= "0" && ch <= "9") ||
      ch === "+" ||
      ch === "/";
    if (!ok) {
      return false;
    }
  }
  return true;
}

/**
 * Whether a decoded filename carries characters no real filename carries.
 *
 * A name is shown to an operator and written to the audit trail. A carriage
 * return or a NUL in either is a way to make one thing look like another, and
 * NULs are exactly what a duplicated header decodes to, because Node joins
 * repeated headers with ", " and base64 discards both characters.
 */
function hasControlCharacters(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export type AgentControlRouteContext = {
  requireRole: (
    res: ServerResponse,
    session: GovernanceSession | undefined,
    minimum: GovernanceRole,
  ) => session is GovernanceSession;
  readJsonObjectBodyOrError: (
    req: IncomingMessage,
    res: ServerResponse,
  ) => Promise<Record<string, unknown> | undefined>;
  toActor: (session: GovernanceSession) => GovernanceActor;
  auditActor: (session: GovernanceSession) => { name: string; role: GovernanceRole };
};

/**
 * Handles the agent-control routes. Returns true when handled, false when the
 * path belongs to another module: the same contract the other two use.
 */
export async function handleGovernanceAgentControlRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  route: string,
  session: GovernanceSession | undefined,
  ctx: AgentControlRouteContext,
): Promise<boolean> {
  const { requireRole, readJsonObjectBodyOrError, toActor, auditActor } = ctx;

  // ---------------------------------------------------------------------
  // Talking to an agent (backlog item A1).
  //
  // §1.6 gives the User tier "targeted access to interact with specific,
  // pre-configured agents… Users may strictly prompt the agents for task
  // execution". Every other User capability existed; this one did not, because
  // the account system was never joined to OpenClaw's chat path.
  //
  // Tier floor is User and the scope check is `canManageAgent`, the same pair
  // that governs every other agent-scoped operation. A Viewer is excluded by
  // tier ("cannot interact with the agent"), and a User only reaches the agents
  // assigned to them. No new permission concept was needed, which is the
  // clearest sign the tier model was drawn correctly.
  if (route === "agent/transcript" && req.method === "GET") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    const agentId = new URL(req.url ?? "/", "http://localhost").searchParams.get("agentId")?.trim();
    if (!agentId) {
      sendInvalidRequest(res, "agentId is required");
      return true;
    }
    if (!canManageAgent(toActor(session), agentId)) {
      sendJson(res, 403, {
        error: { message: `You do not manage agent "${agentId}"`, type: "forbidden" },
      });
      return true;
    }
    if (!(await requireAgentInGroup(res, groupId, agentId))) {
      return true;
    }
    const { readConversation } = await import("../governance/agent-conversation.js");
    const { hasAgentRunner } = await import("../governance/agent-runner.js");
    sendJson(res, 200, {
      agentId,
      // The page hides the composer when nothing can run a prompt, rather than
      // offering an input box whose only possible outcome is an error.
      supported: hasAgentRunner(),
      // Read back under the caller's own name: a conversation belongs to the
      // account that had it, so an Administrator viewing an agent sees their
      // own thread with it and not a User's.
      turns: await readConversation(groupId, agentId, session.username),
    });
    return true;
  }

  // ---------------------------------------------------------------------
  // Uploading an attachment (T14, the HTTP surface).
  //
  // **Raw body, not multipart.** A multipart parser is a state machine over
  // attacker-controlled bytes, and this repository does not ship one. Writing
  // one for a security layer would add exactly the kind of surface the layer
  // exists to reduce. The body is the file, and nothing has to be parsed.
  //
  // It also keeps the property the store was built around: `req` is an
  // `AsyncIterable<Uint8Array>`, so `storeAttachment` refuses **during** the
  // read. Buffering a multipart body first and checking the length afterwards
  // would let the uploader choose how much memory the process allocates before
  // being told no, which is the denial of service the cap exists to prevent.
  //
  // **The filename travels in a header, base64-encoded.** Not a query string:
  // a URL is written to browser history, proxy logs and the Gateway's own
  // access log, and a filename is user data (`Q3-redundancies.pdf` names
  // something even when the bytes are never read). Base64 because a header
  // cannot carry arbitrary UTF-8, and filenames are not ASCII in most of the
  // world. An Arabic or emoji filename would otherwise be mangled or rejected
  // by the HTTP layer before this code ever saw it.
  if (route === "agent/attachment" && req.method === "POST") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    const agentIdHeader = req.headers["x-agent-id"];
    const agentId = typeof agentIdHeader === "string" ? agentIdHeader.trim() : "";
    if (!agentId) {
      sendInvalidRequest(res, "x-agent-id header is required");
      return true;
    }
    // Bounded, which the first version of this route was not (QA round
    // seventeen, finding 115). `canManageAgent` cannot reject an invented id
    // for an Administrator, who manages every agent by role, so without a
    // length rule the id an Administrator sends is written verbatim into the
    // attachment index and from there into the ledger, and the only ceiling on
    // it is Node's header limit. Every other agent-scoped route bounds this;
    // this one inherited none of that by arriving through a header instead of
    // a JSON body.
    if (agentId.length > MAX_AGENT_ID_LENGTH) {
      sendInvalidRequest(res, `agent id must be ${MAX_AGENT_ID_LENGTH} characters or fewer`);
      return true;
    }
    // Attaching is part of prompting, so it needs the authority to prompt this
    // agent, `canManageAgent`, the same check `agent/prompt` makes. It is
    // deliberately *not* `canAuthorPolicyForAgent`: sending a file is not
    // writing policy, and a User whose authoring Root has withheld can still
    // do their job (T27).
    if (!canManageAgent(toActor(session), agentId)) {
      sendJson(res, 403, {
        error: { message: `You do not manage agent "${agentId}"`, type: "forbidden" },
      });
      return true;
    }
    if (!(await requireAgentInGroup(res, groupId, agentId))) {
      return true;
    }
    // **Validated before decoding, because decoding cannot fail** (QA round
    // seventeen, finding 112). `Buffer.from(value, "base64")` never throws: it
    // silently discards anything outside the alphabet. The first version of
    // this route wrapped it in a try/catch and returned 400 on error, which
    // read like validation and was unreachable code. A malformed header
    // produced mojibake, and a *duplicated* header produced NUL bytes, because
    // Node joins repeated headers with ", " and `,` and ` ` are both dropped.
    // Either way a garbage filename entered a tamper-evident ledger instead of
    // being refused.
    const nameHeader = req.headers["x-attachment-name"];
    let declaredName = "unnamed";
    if (nameHeader !== undefined) {
      // An array means the header was sent more than once. Rejected rather than
      // resolved: there is no correct way to choose between two filenames, and
      // picking one silently is how a caller's intent gets replaced by ours.
      if (typeof nameHeader !== "string") {
        sendInvalidRequest(res, "x-attachment-name must be sent at most once");
        return true;
      }
      if (nameHeader.length > 0) {
        if (!isBase64Header(nameHeader)) {
          sendInvalidRequest(res, "x-attachment-name must be base64-encoded UTF-8");
          return true;
        }
        declaredName = Buffer.from(nameHeader, "base64").toString("utf8");
        // A filename is displayed to an operator and written to the ledger.
        // Control characters in either are a way to make one thing look like
        // another, and no real filename contains them.
        if (hasControlCharacters(declaredName)) {
          sendInvalidRequest(res, "attachment name must not contain control characters");
          return true;
        }
      }
    }
    const { storeAttachment, AttachmentQuotaExceededError, AttachmentTooLargeError } =
      await import("../governance/attachment-store.js");
    try {
      const stored = await storeAttachment(groupId, {
        content: req,
        declaredName,
        storedBy: session.username,
        agentId,
      });
      // Metadata only, and the same shape the CLI prints. The bytes are never
      // echoed back by this route or any other: nothing renders an attachment,
      // because an SVG is a script and the governance page is the worst place
      // in the installation to run one.
      sendJson(res, 200, {
        ok: true,
        attachment: {
          sha256: stored.sha256,
          bytes: stored.bytes,
          mimeType: stored.mimeType,
          declaredName: stored.declaredName,
        },
      });
    } catch (err) {
      if (err instanceof AttachmentTooLargeError || err instanceof AttachmentQuotaExceededError) {
        // 413 for both. They are different limits with the same shape, the
        // caller sent more than they may, and the message says which.
        sendJson(res, 413, { error: { message: err.message, type: "attachment-rejected" } });
        return true;
      }
      throw err;
    }
    return true;
  }

  // Discarding an upload that was never sent (QA round 17, finding 113).
  if (route === "agent/attachment/release" && req.method === "POST") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    const body = await readJsonBodyOrError(req, res, MAX_JSON_BODY_BYTES);
    if (body === undefined) {
      return true;
    }
    const sha256 = (body as { sha256?: unknown }).sha256;
    if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) {
      sendInvalidRequest(res, "sha256 must be a SHA-256 hex string");
      return true;
    }
    const { releaseAttachment } = await import("../governance/attachment-store.js");
    const outcome = await releaseAttachment(groupId, sha256, session.username);
    if (outcome === "not-found") {
      // Also the answer for somebody else's attachment, so the reply says
      // nothing about what other accounts hold.
      sendJson(res, 404, { error: { message: "attachment not found", type: "not-found" } });
      return true;
    }
    if (outcome === "already-sent") {
      sendJson(res, 409, {
        error: {
          message: "this attachment has already been sent and is evidence for a ledger entry",
          type: "conflict",
        },
      });
      return true;
    }
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (route === "agent/prompt" && req.method === "POST") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    // A prompt is prose, so it needs a larger ceiling than the 8 KB every other
    // route shares. Still bounded: the body cap and `MAX_PROMPT_LENGTH` are two
    // different limits and both apply.
    const body = await readJsonBodyOrError(req, res, MAX_PROMPT_BODY_BYTES);
    if (body === undefined) {
      return true;
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      sendInvalidRequest(res, "request body must be a JSON object");
      return true;
    }
    const { agentId, message } = body as { agentId?: unknown; message?: unknown };
    if (typeof agentId !== "string" || !agentId.trim()) {
      sendInvalidRequest(res, "agentId is required");
      return true;
    }
    if (typeof message !== "string" || !message.trim()) {
      sendInvalidRequest(res, "message is required");
      return true;
    }
    if (!canManageAgent(toActor(session), agentId.trim())) {
      sendJson(res, 403, {
        error: { message: `You do not manage agent "${agentId.trim()}"`, type: "forbidden" },
      });
      return true;
    }
    if (!(await requireAgentInGroup(res, groupId, agentId.trim()))) {
      return true;
    }
    // ---------------------------------------------------------------------
    // Attachments are referenced by hash, and their facts are read from the
    // store rather than taken from the request (T14).
    //
    // **This is the security-relevant half of the feature.** The client uploads
    // first and then names hashes here. If the ledger recorded the size, type
    // and name the *caller* claimed, an operator could store one harmless byte
    // and have the audit trail describe it as a 4 MB PDF. The trail would be
    // recording an assertion while reading like an observation. Everything
    // written to the chain is therefore looked up from the index, which holds
    // what was actually measured at upload time.
    //
    // **A reference must be to your own upload.** Not because another
    // account's file is dangerous to name, but because accepting any hash
    // would turn this route into an existence oracle: a caller could confirm
    // whether a given file had ever been sent by anybody, by guessing its
    // hash, and for a known file, the hash is not a guess. The same reasoning
    // the login response uses to avoid an account-existence oracle.
    const attachmentRefs = (body as { attachments?: unknown }).attachments;
    const attachments: {
      sha256: string;
      bytes: number;
      mimeType: string;
      declaredName: string;
    }[] = [];
    if (attachmentRefs !== undefined) {
      if (!Array.isArray(attachmentRefs)) {
        sendInvalidRequest(res, "attachments must be an array of SHA-256 strings");
        return true;
      }
      if (attachmentRefs.length > MAX_ATTACHMENTS_PER_PROMPT) {
        sendInvalidRequest(
          res,
          `at most ${MAX_ATTACHMENTS_PER_PROMPT} attachments may be sent with one prompt`,
        );
        return true;
      }
      const { readAttachmentMetadata } = await import("../governance/attachment-store.js");
      for (const ref of attachmentRefs) {
        if (typeof ref !== "string" || !/^[0-9a-f]{64}$/.test(ref)) {
          sendInvalidRequest(res, "each attachment must be a SHA-256 hex string");
          return true;
        }
        const stored = await readAttachmentMetadata(groupId, ref);
        // One message for "no such attachment" and for "not yours", so the
        // response does not distinguish them. Telling them apart is exactly
        // the oracle the ownership check exists to close.
        if (!stored || stored.storedBy !== session.username) {
          sendJson(res, 404, {
            error: { message: "attachment not found", type: "not-found" },
          });
          return true;
        }
        attachments.push({
          sha256: stored.sha256,
          bytes: stored.bytes,
          mimeType: stored.mimeType,
          declaredName: stored.declaredName,
        });
        // Marked here rather than after the run: a prompt that fails still
        // handed the file over, and from this point a ledger entry names it,
        // so it is no longer the uploader's to discard (finding 113).
        const { markAttachmentUsed } = await import("../governance/attachment-store.js");
        await markAttachmentUsed(groupId, stored.sha256);
      }
    }

    const { promptAgent } = await import("../governance/agent-conversation.js");

    // Streaming is opt-in per request, on a POST, and never a separate GET
    // endpoint (A1 follow-up).
    //
    // `EventSource` can only issue GET, which would put the prompt in a query
    // string, and a prompt is the most sensitive text this surface handles:
    // it is redacted before it enters the ledger, and a URL is logged by every
    // proxy, written to the Gateway's access log, and kept in browser history.
    // So the dashboard reads the stream with `fetch` instead, and the body
    // stays a body. The non-streaming response is unchanged and is still what
    // the CLI and every existing test receive, so this adds a mode rather than
    // replacing one.
    const wantsStream =
      (body as { stream?: unknown }).stream === true ||
      (req.headers.accept ?? "").includes("text/event-stream");

    if (!wantsStream) {
      const outcome = await promptAgent(groupId, {
        agentId: agentId.trim(),
        username: session.username,
        message,
        ...(attachments.length > 0 ? { attachments } : {}),
      });
      // A refused prompt is reported as a *result*, not as a transport failure:
      // the request was well-formed and the caller was entitled to make it, and
      // the reason it did not run is something they need to read. A locked-down
      // agent is the one case that gets its own status, because "stopped on
      // purpose" and "failed" are different facts.
      sendJson(res, outcome.lockedDown ? 409 : 200, outcome);
      return true;
    }

    // The status line has to be written before the run starts, so a lockdown
    // refusal or a capacity refusal arrives as an event on an open stream
    // rather than as an HTTP status. That is the cost of streaming and it is
    // paid once: the client reads the outcome from the final event in both
    // cases, so there is one place it learns what happened.
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Proxies that buffer would defeat the entire feature by holding every
    // event until the run ends.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const send = (event: string, data: unknown): void => {
      if (res.writableEnded) {
        return;
      }
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Closing the tab aborts the run (Q-90). Previously a disconnected client
    // left the agent working with no way to reach it short of the kill switch,
    // which locks the agent down entirely. An emergency control being used for
    // "I closed the wrong window".
    const clientGone = new AbortController();
    const onClose = () => clientGone.abort();
    res.on("close", onClose);

    try {
      const outcome = await promptAgent(groupId, {
        agentId: agentId.trim(),
        username: session.username,
        message,
        ...(attachments.length > 0 ? { attachments } : {}),
        signal: clientGone.signal,
        // Sent first, so the page can offer a cancel control while the run is
        // still going. Without it the run id arrives only with the reply, and a
        // cancel button that appears once the answer has come back is not one.
        onStart: (info) => send("started", info),
        onProgress: (replySoFar) => send("progress", { reply: replySoFar }),
      });
      send("done", outcome);
    } catch (err) {
      // An empty prompt is the only thing `promptAgent` throws for, and it was
      // already rejected above; anything else here is unexpected and must still
      // close the stream with a readable outcome rather than a dangling socket.
      send("done", {
        ok: false,
        reply: "",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      res.off("close", onClose);
      res.end();
    }
    return true;
  }

  // Stopping one prompt without stopping the agent (Q-90).
  //
  // Deliberately separate from the kill switch. Lockdown is an emergency
  // control that stops an agent doing anything at all and has to be released by
  // hand; cancelling a prompt withdraws one request. Collapsing the two would
  // train operators to reach for the emergency stop in ordinary circumstances,
  // which is how an emergency stop stops being believed.
  if (route === "agent/cancel" && req.method === "POST") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    const body = await readJsonObjectBodyOrError(req, res);
    if (body === undefined) {
      return true;
    }
    const { runId } = body as { runId?: unknown };
    if (typeof runId !== "string" || !runId.trim()) {
      sendInvalidRequest(res, "runId is required");
      return true;
    }
    const { cancelPromptRun } = await import("../governance/prompt-runs.js");
    const { listAgents } = await import("../governance/agent-registry.js");
    const { canonicalAccountName: fold } = await import("../governance/account-name.js");
    const actor = toActor(session);
    const outcome = cancelPromptRun({
      runId: runId.trim(),
      username: fold(session.username),
      // A prompt belongs to the account that sent it. Administrators and Root
      // may stop any of them, because §1.6 gives them real-time control over
      // agent sessions and a runaway prompt is exactly that; a User may stop
      // their own.
      mayCancelOthers: canManageGlobalPolicy(actor),
      // **Finding 235.** This comment used to end "the scope check that follows
      // still binds an Administrator to agents they may manage", and no such
      // check followed. Even had one been written, `canManageAgent` answers
      // true for every id at Administrator tier, so the only real boundary is
      // the organisation's roster, passed here.
      groupAgentIds: (await listAgents(groupId)).map((agent) => agent.id),
    });
    if (!outcome.cancelled) {
      if (outcome.reason === "forbidden") {
        sendJson(res, 403, {
          error: { message: "That prompt belongs to another account", type: "forbidden" },
        });
        return true;
      }
      // Said plainly rather than reported as a success. A cancel button that
      // always says "cancelled" teaches an operator nothing, and round 13 found
      // the same defect in the kill switch: a mistyped agent id returned 200.
      sendJson(res, 404, {
        cancelled: false,
        error: { message: "No such prompt is running", type: "not_found" },
      });
      return true;
    }
    const { recordAdminAction, ADMIN_ACTIONS } = await import("../governance/admin-audit.js");
    await recordAdminAction(groupId, {
      actor: auditActor(session),
      action: ADMIN_ACTIONS.agentPromptCancel,
      agentId: outcome.agentId,
      subjectId: runId.trim(),
      target: `prompt cancelled`,
    });
    sendJson(res, 200, { cancelled: true, runId: runId.trim(), agentId: outcome.agentId });
    return true;
  }

  // Per-agent escalation timeout.
  //
  // **User floor, not Administrator**, and that is the point of the axis. The
  // installation-wide `policy/hitl-timeout` above answers "how long does this
  // installation wait?" and can only ever answer it once. A User running a long
  // batch on an agent assigned to them needs a different window from an agent
  // doing supervised work, and no single number expresses both.
  //
  // `canManageAgent` rather than `canAuthorPolicyForAgent`: this is acting on a
  // workload you are responsible for, not changing the rules it is judged by,
  // which is the distinction T27 drew and the reason withholding somebody's
  // policy authoring must not also take away control of their own agent.
  if (route === "policy/agent-hitl-timeout" && req.method === "POST") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    const body = await readJsonObjectBodyOrError(req, res);
    if (body === undefined) {
      return true;
    }
    const { agentId, seconds } = body as { agentId?: unknown; seconds?: unknown };
    if (typeof agentId !== "string" || !agentId.trim()) {
      sendInvalidRequest(res, "agentId is required");
      return true;
    }
    if (!isSafeObjectKey(agentId.trim())) {
      // Keyed into a plain object, like `agentAsk`: `__proto__` and friends
      // would either mutate the prototype chain or silently fail to persist.
      sendInvalidRequest(res, "agentId must not be a reserved object key");
      return true;
    }
    // `null` clears the override and returns the agent to the installation
    // value; a number pins it.
    if (
      seconds !== null &&
      (typeof seconds !== "number" ||
        !Number.isFinite(seconds) ||
        seconds < MIN_HITL_TIMEOUT_SECONDS ||
        seconds > MAX_HITL_TIMEOUT_SECONDS)
    ) {
      sendInvalidRequest(
        res,
        `seconds must be a number between ${MIN_HITL_TIMEOUT_SECONDS} and ${MAX_HITL_TIMEOUT_SECONDS}, or null to clear the override`,
      );
      return true;
    }
    if (!canManageAgent(toActor(session), agentId.trim())) {
      sendJson(res, 403, {
        error: { message: `You do not manage agent "${agentId.trim()}"`, type: "forbidden" },
      });
      return true;
    }
    // And that it is this organisation's agent: `canManageAgent` is true for
    // every id above the User tier, so without this an Administrator could name
    // another organisation's agent (the class findings 144 and 235 record).
    if (!(await requireAgentInGroup(res, groupId, agentId.trim()))) {
      return true;
    }
    await setAgentHitlTimeout(
      groupId,
      agentId.trim(),
      seconds === null ? undefined : Math.round(seconds),
      auditActor(session),
    );
    sendJson(res, 200, await loadPolicy(groupId));
    return true;
  }

  // What this account currently has running, so the dashboard can offer a
  // cancel control for a prompt whose original tab is gone.
  if (route === "agent/runs" && req.method === "GET") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    const { listPromptRuns } = await import("../governance/prompt-runs.js");
    const { listAgents } = await import("../governance/agent-registry.js");
    const { canonicalAccountName: fold } = await import("../governance/account-name.js");
    const actor = toActor(session);
    const runs = listPromptRuns({
      username: fold(session.username),
      includeOthers: canManageGlobalPolicy(actor),
      // The organisation's roster (finding 235). The `canManageAgent` filter
      // below is kept because it is what narrows a User or Viewer to their
      // assigned agents, but it is **not** the isolation boundary, because it
      // is unconditionally true above the User tier, and the table behind this
      // is installation-wide.
      groupAgentIds: (await listAgents(groupId)).map((agent) => agent.id),
    })
      // Within the organisation: an Administrator sees every run, a User only
      // the agents assigned to them.
      .filter((run) => canManageAgent(actor, run.agentId));
    sendJson(res, 200, { runs });
    return true;
  }

  // The emergency kill switch, scoped by who manages the agent.
  //
  // Design doc §1.6 gives the Administrator "real-time control to suspend or
  // terminate active sessions", and the tier model extends that downward: a
  // User who manages an agent can stop *that* agent. Stopping a runaway agent
  // is the most time-critical action in the system, so requiring escalation
  // from the person actually watching it would be a safety problem, not a
  // safeguard. Scope still binds: a User cannot stop an agent they were never
  // given.
  if (route === "kill" && req.method === "POST") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    const body = await readJsonObjectBodyOrError(req, res);
    if (body === undefined) {
      return true;
    }
    const { agentId, locked } = body as { agentId?: unknown; locked?: unknown };
    if (typeof agentId !== "string" || !agentId) {
      sendInvalidRequest(res, "agentId is required");
      return true;
    }
    if (!canManageAgent(toActor(session), agentId)) {
      sendJson(res, 403, {
        error: { message: `You do not manage agent "${agentId}"`, type: "forbidden" },
      });
      return true;
    }
    if (!(await requireAgentInGroup(res, groupId, agentId))) {
      return true;
    }
    if (locked === false) {
      await releaseAgentLockdown(groupId, agentId, auditActor(session));
      sendJson(res, 200, { ok: true });
      return true;
    }
    const outcome = await lockDownAgent(groupId, agentId, auditActor(session));
    // Return the measurement so the dashboard can show what actually happened
    // and requirement #7's latency bound is observable, not just asserted.
    sendJson(res, 200, {
      ok: true,
      elapsedMs: Math.round(outcome.elapsedMs * 10) / 10,
      // Both measurements, so the dashboard can distinguish "we asked" from
      // "it stopped" rather than presenting one number as if it were the other.
      dispatchMs: Math.round(outcome.termination.dispatchMs * 10) / 10,
      stoppedConfirmed: outcome.termination.stoppedConfirmed,
      abortedRunIds: outcome.termination.abortedRunIds,
      inFlightTerminationSupported: outcome.termination.supported,
      // The stop landed and its ledger entry did not (finding 195). Reported
      // beside the success rather than as a failure: the agent *is* stopped,
      // and telling the operator otherwise during an incident is the reading
      // that makes them escalate. Absent on the ordinary path.
      ...(outcome.auditError ? { auditError: outcome.auditError } : {}),
    });
    return true;
  }

  return false;
}
