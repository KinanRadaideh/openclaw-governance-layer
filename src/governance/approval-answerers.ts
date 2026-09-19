// Who answered an escalation, carried to the code that files its rule request (C15).
//
// A request filed by "Always allow" is written by the policy's approval callback, in the
// agent's run, which learns the decision and nothing about who made it. Since T68 a
// dashboard escalation is answered by a signed-in governance account, and the approvals
// route knows exactly which. So the route notes the account under the approval's id
// before it resolves the approval, and the approval hook runs the callback inside that
// id (`runForResolvedApproval`), where `takeResolvingApprovalAnswerer` reads it.
//
// Nothing here is authority: the note only names who asked, on a request an
// Administrator still decides. A note is taken once, forgotten when the answer does not
// land, and bounded, so a callback that never runs cannot grow this without limit. An
// approval answered anywhere else (a chat run, the Control UI) has no note, and its
// request keeps the labelled origin `hitl-approval`.
import { AsyncLocalStorage } from "node:async_hooks";
import type { GovernanceRole } from "./roles.js";

export type ApprovalAnswerer = { name: string; role: GovernanceRole };

/** Longer than the longest approval window (24 hours), so a slow answer still finds its note. */
const NOTE_TTL_MS = 25 * 60 * 60 * 1000;
const MAX_NOTES = 256;

const notes = new Map<string, ApprovalAnswerer & { notedAtMs: number }>();
const resolving = new AsyncLocalStorage<string>();

function prune(now: number): void {
  for (const [id, note] of notes) {
    if (now - note.notedAtMs > NOTE_TTL_MS) {
      notes.delete(id);
    }
  }
  while (notes.size >= MAX_NOTES) {
    const oldest = notes.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    notes.delete(oldest);
  }
}

/** Called by the approvals route before it resolves `approvalId`. */
export function noteApprovalAnswerer(approvalId: string, answerer: ApprovalAnswerer): void {
  const now = Date.now();
  prune(now);
  notes.set(approvalId, { ...answerer, notedAtMs: now });
}

/** Called by the approvals route when its answer did not land. */
export function forgetApprovalAnswerer(approvalId: string): void {
  notes.delete(approvalId);
}

/** Runs an approval's resolution callback with that approval's id in scope. */
export function runForResolvedApproval<T>(approvalId: string | undefined, run: () => T): T {
  return approvalId ? resolving.run(approvalId, run) : run();
}

/** The account that answered the approval being resolved, once; undefined when none did. */
export function takeResolvingApprovalAnswerer(): ApprovalAnswerer | undefined {
  const approvalId = resolving.getStore();
  if (!approvalId) {
    return undefined;
  }
  const note = notes.get(approvalId);
  notes.delete(approvalId);
  return note ? { name: note.name, role: note.role } : undefined;
}
