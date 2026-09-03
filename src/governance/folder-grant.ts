// Granting a folder and excepting things inside it, as one act.
//
// ## What this is, and what it is not
//
// **The engine has always done this.** A `path` rule is a pattern, `^/work(/|$)`
// binds a subtree, and denials are evaluated before allowances across every
// tier, so an allow on a folder plus a deny on a file inside it already gives
// exactly the intended behaviour. Nothing here changes evaluation.
//
// What did not exist was a way to *say* it. An operator had to write two
// regular expressions by hand and know that deny beats allow, and nothing in
// the interface said so. This composes the two writes into one act and derives
// the patterns from paths, so the operator states an intention rather than an
// implementation.
//
// **It is additive, and that is a constraint rather than an accident.** The
// existing add-rule form is untouched; hand-writing a deny inside an allowed
// folder keeps working; and, the part that matters most, **everything this
// produces is an ordinary rule**. Each one appears in the rule list on its own,
// carries its own id, and can be edited or removed individually. A generated
// pair that could only be deleted together would have traded a capability for a
// convenience.
//
// ## Why it composes `addRuleChecked` rather than writing rules itself
//
// The same rule M6 established for provisioning: compose the mutators that
// already exist. Every rule written here therefore inherits the write lock,
// conflict detection, the pattern-safety warnings, tier validation and the
// ledger entry, and cannot drift from what the ordinary path does. The
// alternative, assembling `PolicyRule` objects and saving the document, would
// be a second way to write policy, and two ways to write one thing is how they
// come to disagree.
//
// ## The order the rules are written in
//
// **The exceptions are written first, then the grant.** Evaluation order does
// not depend on it, deny beats allow whenever both exist, but *failure* order
// does. If writing stops half-way, having written the denials leaves the agent
// with less access than intended; having written the grant first would leave it
// with more, for as long as nobody noticed. When a partial result is possible,
// the safe half goes first.
import type { AuditActorInput } from "./admin-audit.js";
import { normalizeGovernedPath } from "./path-normalize.js";
import { addRuleChecked, type AddRuleResult } from "./policy-store.js";
import type { RuleAccess } from "./policy-types.js";
import { validateRulePattern } from "./rule-validation.js";

/**
 * How many exceptions one grant may carry.
 *
 * **Found by QA on this module, not by design.** Nothing bounded it, so a single
 * request could write unbounded rules: each taking the policy write lock, each
 * appended to the tamper-evident ledger, and all of them from one click. The
 * number is generous for the use this control exists for (a folder with a
 * handful of carve-outs) and small enough that the worst case is a rejected
 * request rather than a policy nobody can read.
 */
const MAX_EXCEPTIONS = 50;

/**
 * Escapes a literal so it can sit inside a larger pattern.
 *
 * **Deliberately not `pattern-match.ts`'s `escapeRegExp`, and the difference
 * caused a real bug here.** That helper does not only escape: it also wraps the
 * result in start and end anchors, because its job is turning a literal into a
 * pattern matching *only* that value. Used inside a larger expression it
 * produced a doubly-anchored pattern that compiles and matches nothing, so a
 * folder grant would have bound no paths at all. Caught by this module's own
 * tests before it shipped.
 *
 * The lesson is in the name: a function called `escapeRegExp` that also anchors
 * is doing two things, and the second is invisible at the call site.
 */
function escapeLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, (match) => `\\${match}`);
}

/** Raised when a folder grant could not be expressed as rules. */
export class FolderGrantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FolderGrantError";
  }
}

export type FolderGrantInput = {
  /** The folder being granted, as an operator would type it. */
  folder: string;
  /** Paths inside it that stay denied. May be empty. */
  exceptions?: readonly string[];
  /** Agent this applies to. Absent means every agent, which needs Administrator. */
  agentId?: string;
  /** Narrow the grant to reads or writes. Denials are never narrowed. See below. */
  access?: RuleAccess;
  /** Workspace root, so a relative path normalises the way the gate will read it. */
  cwd?: string;
};

export type FolderGrantResult = {
  grant: AddRuleResult;
  exceptions: AddRuleResult[];
};

/**
 * Turns one normalised path into a pattern binding it and everything beneath.
 *
 * The `(/|$)` suffix rather than a bare prefix, and the difference is a real
 * defect class: `^work` also matches `work-other`, so a grant on one folder
 * would silently cover a sibling whose name starts the same way. The suffix
 * requires either the end of the path or a separator, which is the boundary a
 * human means by "this folder".
 */
function subtreePattern(normalised: string, original: string): string {
  const pattern = `^${escapeLiteral(normalised)}(/|$)`;
  // **Validated here rather than in the routes, and that placement is the
  // finding.** `addRuleChecked` does not validate patterns. The HTTP add-rule
  // route calls `validateRulePattern` itself before reaching it. Doing the same
  // in this module's *callers* would have left the CLI, which calls this
  // function directly, writing rules the dashboard would refuse: two surfaces
  // applying one rule two ways, which is the defect this project has found more
  // often than any other. Putting it here means every surface inherits it.
  //
  // These patterns are escaped literals, so the backtracking half can never
  // fail. The length cap can: a long enough path produces a pattern the rest of
  // the system will not accept, and the operator should be told that here
  // rather than have it stored and refused later.
  const verdict = validateRulePattern(pattern);
  if (!verdict.ok) {
    throw new FolderGrantError(`"${original}" cannot be expressed as a rule: ${verdict.error}`);
  }
  return pattern;
}

/**
 * Writes a folder grant and its exceptions as ordinary rules.
 *
 * Paths are normalised through the same function the gate uses, so what an
 * operator types and what the rule matches cannot disagree. The mismatch T23
 * and the path-normalisation work exist to prevent, arriving here by a new
 * route because this is a *third* place a path becomes a pattern.
 */
export async function grantFolderWithExceptions(
  groupId: string,
  input: FolderGrantInput,
  actor: AuditActorInput,
): Promise<FolderGrantResult> {
  const folder = input.folder.trim();
  if (!folder) {
    throw new FolderGrantError("a folder is required");
  }
  const exceptions = (input.exceptions ?? []).map((entry) => entry.trim()).filter(Boolean);
  if (exceptions.length > MAX_EXCEPTIONS) {
    throw new FolderGrantError(
      `a grant may carry at most ${MAX_EXCEPTIONS} exceptions; this one has ${exceptions.length}`,
    );
  }

  const grantPath = await normalizeGovernedPath(folder, input.cwd);
  const exceptionPaths = await Promise.all(
    exceptions.map((entry) => normalizeGovernedPath(entry, input.cwd)),
  );

  // An exception outside the folder it excepts from is almost always a typo,
  // and its effect is not harmless: it writes a denial somewhere the operator
  // was not looking. Refused with both paths named, rather than written and
  // left to be discovered. Checked before any write, so a rejected input leaves
  // the policy exactly as it was.
  for (const [index, exceptionPath] of exceptionPaths.entries()) {
    if (exceptionPath !== grantPath && !exceptionPath.startsWith(`${grantPath}/`)) {
      throw new FolderGrantError(
        `"${exceptions[index]}" is not inside "${folder}", so excepting it here would ` +
          "write a denial outside the folder being granted. Add it as its own deny rule " +
          "if that is what you meant.",
      );
    }
  }

  const scope = input.agentId ? { agentId: input.agentId } : {};

  // Denials first. See the note at the top of this file: a partial write should
  // leave less access than intended, never more.
  const written: AddRuleResult[] = [];
  for (const [index, exceptionPath] of exceptionPaths.entries()) {
    written.push(
      await addRuleChecked(
        groupId,
        {
          resourceKind: "path",
          pattern: subtreePattern(exceptionPath, exceptions[index] ?? folder),
          effect: "deny",
          // **Deliberately not narrowed by `access`, even when the grant is.**
          // A grant narrowed to reads plus an exception narrowed to reads would
          // leave the excepted path *writable*, which is the opposite of what
          // "except this" means to the person who typed it. An exception is an
          // exception to the whole folder.
          description: `Exception to the grant on ${folder}: ${exceptions[index]}`,
          ...scope,
        },
        actor,
      ),
    );
  }

  const grant = await addRuleChecked(
    groupId,
    {
      resourceKind: "path",
      pattern: subtreePattern(grantPath, folder),
      effect: "allow",
      ...(input.access ? { access: input.access } : {}),
      description:
        exceptions.length > 0
          ? `Grant on ${folder}, except ${exceptions.join(", ")}`
          : `Grant on ${folder}`,
      ...scope,
    },
    actor,
  );

  return { grant, exceptions: written };
}
