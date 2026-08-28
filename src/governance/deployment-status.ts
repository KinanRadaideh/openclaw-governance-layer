// Does this installation actually match the architecture the design promises?
//
// Backlog item A7. The design doc §1.6 gives Root "overseeing the deployment and
// network configurations of the governance layer on the VPS" — the one clause of
// that tier's definition with nothing behind it. Every other Root capability
// (accounts, roles, assignments) was built; this was not.
//
// **What "overseeing" was taken to mean, and why.** Not editing. Changing a bind
// address or an auth mode from the dashboard you are connected *through* can
// lock you out of it in one click, and it would need config writing plus gateway
// restart handling — a large feature whose failure mode is losing access to the
// control plane during an incident. Oversight here means *reading the live
// deployment and saying whether it matches what Chapter 1 claims*, with the
// judgement attached. Changing it stays a server-admin act, outside this app.
//
// The claims being checked are quoted, not paraphrased. §1.6:
//
//   "the web-based administrative dashboard is intentionally isolated from the
//    public internet. It does not expose standard HTTP/HTTPS ports globally;
//    rather, it listens only on localhost, and access requires secure
//    cryptographic tunneling, specifically utilizing SSH local port forwarding"
//
// plus §1.4's "minimum hardware specification of 8 GB RAM" and requirement #9's
// Linux target.
//
// ---------------------------------------------------------------------------
// **This module imports nothing from `../gateway/`, `../security/` or
// `../config/`, and must not start.**
//
// `src/governance/` currently imports from `node:*`, `../infra/`, `../agents/`,
// `../sessions/`, `../routing/`, `../logging/` and nothing else. That is not an
// accident: `agent-runner.ts` and `agent-terminator.ts` both use a registration
// seam precisely because the governance layer is exercised by the CLI and by
// unit tests with no Gateway running.
//
// The obvious implementation of this feature — call
// `collectGatewayConfigFindings` from `src/security/audit-gateway-config.ts` —
// would create the first governance→gateway edge in the codebase, because that
// module imports `../gateway/auth-resolve.js`. So the findings arrive as a
// **parameter** instead, assembled by `src/gateway/governance-deployment-input.ts`. The
// result is a pure function of its inputs, which is also what makes every check
// below testable on any platform without a Gateway, a socket or a config file.
//
// Type-only imports are erased (`verbatimModuleSyntax: true`), so the two below
// cost nothing at runtime.
// ---------------------------------------------------------------------------
//
// **No shell-out, no socket probing.** `system-status.ts` states the rule this
// follows: the governance layer must not itself become a way to execute
// commands on the host. That rules out three tempting helpers —
// `inspectPathPermissions` (`icacls` on Windows), `resolveOsSummary` (`sw_vers`
// on macOS) and `resolveGatewayBindHost` (opens a real socket to probe). Host
// facts that cannot be read without one of those are injected by the caller.
import { stat } from "node:fs/promises";
import { platform as osPlatform, totalmem } from "node:os";
import type { GatewayBindMode } from "../config/types.gateway.js";
import { tryReadDiskSpace } from "../infra/disk-space.js";
import type { SecurityAuditFinding } from "../security/audit.types.js";
import { shortenHomePath } from "../utils.js";
import { attachmentStoreStats } from "./attachment-store.js";
import { hasCheckpointForGroup } from "./audit-ledger.js";
import {
  governanceHomeDir,
  ledgerFilePath,
  ledgerKeyFilePath,
  sessionsFilePath,
  usersFilePath,
} from "./paths.js";
import { loadPolicy as loadPolicyForDeployment } from "./policy-store.js";

/**
 * `unknown` is load-bearing, not decoration.
 *
 * A check that silently degrades to green when it could not run is exactly the
 * failure this feature exists to catch — a verification report that is
 * confidently green because the detector was disconnected. POSIX mode bits mean
 * nothing on Windows and `statfsSync` is not always present, so those checks
 * report that they could not answer rather than answering wrongly.
 *
 * The same reasoning is already written into `system-status.ts` for
 * `loadAverageSupported`: reported honestly rather than faked.
 */
export type DeploymentCheckStatus = "pass" | "warn" | "fail" | "unknown";

export type DeploymentCheck = {
  /**
   * Stable dotted id. Checks this module owns use `deployment.*`; a finding
   * folded in from the host's security audit keeps **its own** id
   * (`gateway.*`, `discovery.*`), so the two can be cross-referenced.
   */
  id: string;
  title: string;
  status: DeploymentCheckStatus;
  /** What was observed, not what ought to be true. */
  detail: string;
  remediation?: string;
  /**
   * `gateway-audit` means the title, detail and remediation are the host
   * security audit's own words, copied verbatim rather than re-authored here.
   * Two components describing one condition in different words is this
   * project's single most frequent defect shape.
   */
  source: "governance" | "gateway-audit";
};

/**
 * Facts with no verdict attached.
 *
 * Kept off the check list deliberately. "Where is the governance directory" has
 * no pass/fail answer, and inventing a fifth status to carry it would make the
 * status vocabulary describe presentation rather than truth.
 */
export type DeploymentFacts = {
  platform: string;
  totalMemoryBytes: number;
  bind: GatewayBindMode;
  port: number;
  authMode: GatewayAuthMode;
  tailscaleMode: string;
  /** Home-shortened for display. Root-tier information — see the note below. */
  governanceDir: string;
  governanceDirRelocated: boolean;
  /** Titles of `info`-severity host findings, which carry no verdict. */
  gatewayNotes: string[];
};

export type DeploymentStatus = {
  facts: DeploymentFacts;
  checks: DeploymentCheck[];
  summary: { pass: number; warn: number; fail: number; unknown: number };
  /** Worst non-`unknown` status across all checks. */
  overall: "pass" | "warn" | "fail";
  sampledAt: string;
};

export type GatewayAuthMode = "none" | "token" | "password" | "trusted-proxy";

/**
 * Everything about the Gateway this module needs, reduced to plain data.
 *
 * Note what is **absent**: `resolveGatewayAuth` returns the plaintext token and
 * password on the same object as the mode, and neither crosses this boundary.
 * Only the mode and a presence boolean do. Root is the governance owner, which
 * is not the same thing as a licence to print the host's secrets into an HTTP
 * response.
 */
export type DeploymentEnvironmentInput = {
  bind: GatewayBindMode;
  port: number;
  authMode: GatewayAuthMode;
  /** Presence only. The secret itself never reaches this module. */
  authSecretConfigured: boolean;
  tailscaleMode: string;
  controlUiEnabled: boolean;
  hasNonLoopbackTrustedProxy: boolean;
  tlsEnabled: boolean;
  /** From `collectGatewayConfigFindings`, assembled by the caller. */
  gatewayFindings: readonly SecurityAuditFinding[];
};

type StatResult = { exists: boolean; mode: number | null };

export type ReadDeploymentStatusOptions = {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  totalMemoryBytes?: number;
  now?: () => Date;
  /** Injected so the permission table is testable on a platform without one. */
  statPath?: (path: string) => Promise<StatResult>;
  /** Injected so the disk thresholds are testable without a real volume. */
  readDiskSpace?: (path: string) => { availableBytes: number; totalBytes: number } | null;
};

/**
 * The 8 GB minimum from §1.4, in **decimal** gigabytes.
 *
 * `8 * 1024 ** 3` would be the natural thing to write and it is wrong for this
 * purpose: a host advertised as "8 GB" reports roughly 7.6–7.9 GiB once
 * firmware and kernel reservations are taken out, so a binary threshold fails
 * every genuine 8 GB VPS. The constraint is written in the vendor's units, so
 * it is checked in the vendor's units.
 */
const MINIMUM_TOTAL_MEMORY_BYTES = 8 * 1000 ** 3;

/** Below this, an append-only ledger is a foreseeable outage. */
const LOW_DISK_BYTES = 1024 ** 3;

/**
 * Host security-audit checks this module asserts should produce **no** finding.
 *
 * Transcribed from the `checkId` strings in
 * `src/security/audit-gateway-config.ts`. The absence of a finding is what gets
 * reported as a `pass` — which is the whole difference between a detector and a
 * verification report. `collectGatewayConfigFindings` only speaks when
 * something is wrong; oversight has to be able to say that something is right.
 *
 * **The failure mode this list creates, and the test that covers it.** If a
 * `checkId` is renamed upstream, the entry here stops matching and that check
 * becomes a permanent, silent `pass` — a green report produced by a
 * disconnected detector, which is the worst outcome this feature could have.
 * `src/gateway/governance-deployment-input.test.ts` drives the real audit and asserts each
 * of these ids actually fires, so a rename breaks a test rather than a promise.
 */
const EXPECTED_ABSENT_GATEWAY_CHECKS: readonly { id: string; title: string }[] = [
  { id: "gateway.bind_no_auth", title: "Gateway exposed beyond loopback without authentication" },
  { id: "gateway.loopback_no_auth", title: "Gateway authentication on loopback" },
  { id: "gateway.control_ui.allowed_origins_wildcard", title: "Control UI origin allowlist" },
  { id: "gateway.control_ui.host_header_origin_fallback", title: "Host-header origin fallback" },
  { id: "gateway.real_ip_fallback_enabled", title: "X-Real-IP fallback" },
  { id: "gateway.tailscale_funnel", title: "Tailscale Funnel exposure" },
  { id: "gateway.token_too_short", title: "Gateway token length" },
];

async function defaultStatPath(path: string): Promise<StatResult> {
  try {
    const info = await stat(path);
    return { exists: true, mode: info.mode };
  } catch {
    return { exists: false, mode: null };
  }
}

/** POSIX permission bits, or null where they are not meaningful. */
function permissionBits(mode: number | null): number | null {
  return mode === null ? null : mode & 0o777;
}

function check(
  id: string,
  title: string,
  status: DeploymentCheckStatus,
  detail: string,
  remediation?: string,
): DeploymentCheck {
  return {
    id,
    title,
    status,
    detail,
    ...(remediation ? { remediation } : {}),
    source: "governance",
  };
}

/**
 * Maps a host finding's severity onto this module's vocabulary.
 *
 * `info` is deliberately absent: an informational finding carries no verdict
 * (`gateway.tailscale_serve` merely states that Serve is on), so mapping it to
 * either `pass` or `warn` would assert something the audit did not. Those are
 * routed into `facts.gatewayNotes` instead.
 */
function statusForSeverity(severity: SecurityAuditFinding["severity"]): "fail" | "warn" | null {
  if (severity === "critical") {
    return "fail";
  }
  if (severity === "warn") {
    return "warn";
  }
  return null;
}

function foldGatewayFindings(findings: readonly SecurityAuditFinding[]): {
  checks: DeploymentCheck[];
  notes: string[];
} {
  const checks: DeploymentCheck[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();

  for (const finding of findings) {
    const status = statusForSeverity(finding.severity);
    if (status === null) {
      notes.push(finding.title);
      continue;
    }
    seen.add(finding.checkId);
    // Verbatim. Re-wording here would put two descriptions of one condition
    // into the system, which is how this project's defects usually start.
    checks.push({
      id: finding.checkId,
      title: finding.title,
      status,
      detail: finding.detail,
      ...(finding.remediation ? { remediation: finding.remediation } : {}),
      source: "gateway-audit",
    });
  }

  for (const expected of EXPECTED_ABSENT_GATEWAY_CHECKS) {
    if (seen.has(expected.id)) {
      continue;
    }
    checks.push({
      id: expected.id,
      title: expected.title,
      status: "pass",
      detail: "The gateway configuration audit raised nothing for this check.",
      source: "gateway-audit",
    });
  }
  return { checks, notes };
}

export async function readDeploymentStatus(
  /**
   * The organisation this report is about (M5).
   *
   * The report mixes two scopes and always has: some checks are about the
   * **installation** (the ledger key's permissions, the listener, the tunnel)
   * and some about **one organisation's** state (its policy, its chain). Before
   * per-group storage the distinction did not exist, because there was one of
   * everything. It does now, so the caller says whose — and a Root reading this
   * sees their own organisation's rulebook and ledger beside the installation
   * facts, never another organisation's.
   */
  groupId: string,
  input: DeploymentEnvironmentInput,
  options: ReadDeploymentStatusOptions = {},
): Promise<DeploymentStatus> {
  const env = options.env ?? process.env;
  const platform = options.platform ?? osPlatform();
  const totalMemoryBytes = options.totalMemoryBytes ?? totalmem();
  const now = options.now ?? (() => new Date());
  const statAt = options.statPath ?? defaultStatPath;
  const readDisk =
    options.readDiskSpace ??
    ((path: string) => {
      const snapshot = tryReadDiskSpace(path);
      return snapshot
        ? { availableBytes: snapshot.availableBytes, totalBytes: snapshot.totalBytes }
        : null;
    });

  const posixPermissions = platform !== "win32";
  const home = governanceHomeDir();
  const checks: DeploymentCheck[] = [];

  // -------------------------------------------------------------------
  // The architecture claims from §1.6.
  // -------------------------------------------------------------------
  checks.push(
    input.bind === "loopback"
      ? check(
          "deployment.bind_loopback",
          "Listener is loopback-only",
          "pass",
          "The Gateway binds to loopback, so it is not reachable from another host directly.",
        )
      : input.bind === "tailnet"
        ? check(
            "deployment.bind_loopback",
            "Listener is loopback-only",
            "warn",
            "The Gateway binds to a Tailscale address. Reachable from the tailnet rather than from the public internet, which is narrower than the design describes but not loopback.",
            'Set gateway.bind to "loopback" to match the architecture in §1.6.',
          )
        : check(
            "deployment.bind_loopback",
            "Listener is loopback-only",
            "fail",
            `The Gateway binds "${input.bind}", so it accepts connections from other hosts. §1.6 states the dashboard "listens only on localhost".`,
            'Set gateway.bind to "loopback" and reach the dashboard through an SSH local port forward.',
          ),
  );

  const standardWebPort = input.port === 80 || input.port === 443;
  checks.push(
    !standardWebPort
      ? check(
          "deployment.nonstandard_port",
          "No standard web port exposed",
          "pass",
          `Listening on ${input.port}, which is not a standard HTTP/HTTPS port.`,
        )
      : input.bind === "loopback"
        ? check(
            "deployment.nonstandard_port",
            "No standard web port exposed",
            "warn",
            `Listening on ${input.port}. Loopback-only, so it is not exposed — but §1.6 says the dashboard "does not expose standard HTTP/HTTPS ports globally", and this is one bind change away from doing so.`,
            "Move the Gateway to a non-standard port.",
          )
        : check(
            "deployment.nonstandard_port",
            "No standard web port exposed",
            "fail",
            `Listening on ${input.port} with bind "${input.bind}" — a standard web port, reachable from other hosts.`,
            "Move the Gateway to a non-standard port and bind it to loopback.",
          ),
  );

  // §1.6 expects access "requires secure cryptographic tunneling, specifically
  // utilizing SSH local port forwarding".
  //
  // **No process can verify that a human typed `ssh -L`.** `SSH_CONNECTION` and
  // `SSH_CLIENT` describe the shell this code happens to be running in, say
  // nothing about how the *dashboard* is reached, and are absent entirely from
  // a Gateway started as a daemon. Checking them would produce a confident
  // answer to a different question.
  //
  // What can be established, and is a strictly stronger claim, is that **no
  // other route exists**: loopback bind, Tailscale off, no non-loopback trusted
  // proxy, no TLS listener. Then any access from another machine must arrive
  // through a local port forward, because there is nothing else to arrive
  // through. When it fails, the detail names the alternative route that exists
  // rather than saying "no tunnel detected".
  const alternativeRoutes: string[] = [];
  if (input.bind !== "loopback") {
    alternativeRoutes.push(`a "${input.bind}" bind`);
  }
  if (input.tailscaleMode && input.tailscaleMode !== "off") {
    alternativeRoutes.push(`Tailscale (${input.tailscaleMode})`);
  }
  if (input.hasNonLoopbackTrustedProxy) {
    alternativeRoutes.push("a non-loopback trusted proxy");
  }
  if (input.tlsEnabled) {
    alternativeRoutes.push("a TLS listener");
  }
  checks.push(
    alternativeRoutes.length === 0
      ? check(
          "deployment.tunnel_required",
          "A tunnel is the only way in",
          "pass",
          "No route to the dashboard exists from another host except a local port forward, which is what §1.6 requires.",
        )
      : check(
          "deployment.tunnel_required",
          "A tunnel is the only way in",
          "warn",
          `The dashboard is reachable without an SSH tunnel: ${alternativeRoutes.join(", ")}.`,
          "Remove the alternative routes, or record the deviation deliberately.",
        ),
  );

  checks.push(
    input.authMode === "none"
      ? check(
          "deployment.gateway_auth",
          "Gateway authentication configured",
          "fail",
          "The Gateway accepts unauthenticated connections. The governance login is a second gate layered on this one, not a replacement for it.",
          "Configure gateway.auth with a token or a password.",
        )
      : check(
          "deployment.gateway_auth",
          "Gateway authentication configured",
          input.authSecretConfigured ? "pass" : "warn",
          input.authSecretConfigured
            ? `Gateway auth mode is "${input.authMode}" and a credential is configured.`
            : `Gateway auth mode is "${input.authMode}" but no credential appears to be configured.`,
          input.authSecretConfigured
            ? undefined
            : "Supply the credential the configured mode expects.",
        ),
  );

  // -------------------------------------------------------------------
  // The shipped security floor, and whether it is still where it shipped.
  //
  // Root may switch off the five core rules that are not self-protecting
  // (T24). That is a legitimate operator decision and it is also the single
  // most consequential change any account can make, so it is reported here
  // rather than left to be noticed. A lowered floor must not be able to hide:
  // an installation that looks clean on this report while a credential denial
  // is switched off would be worse than one with no report at all.
  // -------------------------------------------------------------------
  const disabledCore = (await loadPolicyForDeployment(groupId)).disabledCoreRules ?? [];
  checks.push(
    disabledCore.length === 0
      ? check(
          "deployment.core_rules_intact",
          "Shipped core denials are all in force",
          "pass",
          "No core rule has been switched off.",
        )
      : check(
          "deployment.core_rules_intact",
          "Shipped core denials are all in force",
          // `fail`, not `warn`. A warning is something to read later; this is a
          // deliberate reduction of the floor the report's central claim rests
          // on, and Chapter 4 quotes this output as evidence.
          "fail",
          `${disabledCore.length} core rule(s) switched off by Root: ${disabledCore.join(", ")}.`,
          "Re-enable with `governance policy core-rule <id> true`, or record the deviation deliberately — this report is evidence, and it should say what is actually in force.",
        ),
  );

  // -------------------------------------------------------------------
  // The attachment store (T14). Reported because it is the one place the
  // governance layer holds bytes it did not generate and cannot inspect —
  // content a person uploaded, kept as evidence. An operator should be able to
  // see how much of it there is and whether any of it is unreferenced, without
  // going to look on the host.
  // -------------------------------------------------------------------
  const attachments = await attachmentStoreStats(groupId);
  checks.push(
    attachments.orphanCount === 0
      ? check(
          "deployment.attachment_store",
          "Attachment store is consistent",
          "pass",
          attachments.count === 0
            ? "No attachments stored."
            : `${attachments.count} attachment(s), ${Math.round(attachments.totalBytes / 1024)} KB, all referenced.`,
        )
      : check(
          "deployment.attachment_store",
          "Attachment store is consistent",
          // A warning rather than a failure: orphans waste space and indicate a
          // half-completed write or a restore from mismatched backups, but they
          // do not weaken any control. Calling it `fail` would put it beside a
          // disabled core denial, which is a different order of problem.
          "warn",
          `${attachments.orphanCount} stored file(s) are not referenced by any ledger entry.`,
          "Run the orphan sweep, or investigate whether an index was restored from an older backup than the files beside it.",
        ),
  );

  // -------------------------------------------------------------------
  // Governance's own state, which the host's security audit knows nothing
  // about.
  // -------------------------------------------------------------------
  if (!posixPermissions) {
    checks.push(
      check(
        "deployment.governance_dir_permissions",
        "Governance directory is private",
        "unknown",
        `POSIX permission bits are not meaningful on ${platform}, so this could not be determined here.`,
      ),
      check(
        "deployment.governance_files_permissions",
        "Governance files are private",
        "unknown",
        `POSIX permission bits are not meaningful on ${platform}, so this could not be determined here.`,
      ),
    );
  } else {
    const dirStat = await statAt(home);
    const dirBits = permissionBits(dirStat.mode);
    checks.push(
      !dirStat.exists
        ? check(
            "deployment.governance_dir_permissions",
            "Governance directory is private",
            "unknown",
            "The governance directory does not exist yet; it is created on first use.",
          )
        : dirBits === 0o700
          ? check(
              "deployment.governance_dir_permissions",
              "Governance directory is private",
              "pass",
              "Mode is 0700 — owner only.",
            )
          : check(
              "deployment.governance_dir_permissions",
              "Governance directory is private",
              "fail",
              `Mode is ${(dirBits ?? 0).toString(8).padStart(4, "0")}; expected 0700. Group or world access to this directory means access to the policy, the accounts and the ledger key.`,
              "chmod 700 the governance directory.",
            ),
    );

    const files = [
      ledgerKeyFilePath(),
      usersFilePath(),
      sessionsFilePath(),
      ledgerFilePath(groupId),
    ];
    const offenders: string[] = [];
    let checkedAny = false;
    for (const file of files) {
      const info = await statAt(file);
      if (!info.exists) {
        continue;
      }
      checkedAny = true;
      const bits = permissionBits(info.mode);
      if (bits !== 0o600) {
        // Basename only. The directory is already reported as a fact; repeating
        // the full path once per offender adds nothing and widens the blast
        // radius if this response is ever pasted somewhere.
        offenders.push(
          `${file.split(/[\\/]/).pop() ?? file} (${(bits ?? 0).toString(8).padStart(4, "0")})`,
        );
      }
    }
    checks.push(
      !checkedAny
        ? check(
            "deployment.governance_files_permissions",
            "Governance files are private",
            "unknown",
            "No governance state files exist yet.",
          )
        : offenders.length === 0
          ? check(
              "deployment.governance_files_permissions",
              "Governance files are private",
              "pass",
              "Every governance state file is mode 0600 — owner only.",
            )
          : check(
              "deployment.governance_files_permissions",
              "Governance files are private",
              "fail",
              `Expected mode 0600: ${offenders.join(", ")}.`,
              "chmod 600 the listed files.",
            ),
    );
  }

  const ledgerKeyFromEnv = env.OPENCLAW_GOVERNANCE_LEDGER_KEY?.trim();
  checks.push(
    ledgerKeyFromEnv
      ? check(
          "deployment.ledger_key_source",
          "Ledger key is held off-host",
          "pass",
          "The ledger key is supplied through OPENCLAW_GOVERNANCE_LEDGER_KEY rather than read from this disk.",
        )
      : check(
          "deployment.ledger_key_source",
          "Ledger key is held off-host",
          "warn",
          "The ledger key is stored on the same host as the ledger it protects, so an attacker with full filesystem access can still forge the chain.",
          "Supply the key through OPENCLAW_GOVERNANCE_LEDGER_KEY from a secret store, so reading the ledger is not enough to rewrite it.",
        ),
  );

  const ledgerPresent = (await statAt(ledgerFilePath(groupId))).exists;
  // **This group's checkpoint, not merely the file's existence (M5).** One file
  // now holds a head per group, so it exists as soon as any organisation has
  // written — and asking about the file would report a truncation defence this
  // group does not have.
  const checkpointPresent = await hasCheckpointForGroup(groupId);
  checks.push(
    checkpointPresent
      ? check(
          "deployment.ledger_checkpoint",
          "Ledger checkpoint present",
          "pass",
          "The checkpoint exists, so entries removed from the end of the ledger are detectable.",
        )
      : ledgerPresent
        ? check(
            "deployment.ledger_checkpoint",
            "Ledger checkpoint present",
            "warn",
            "A ledger exists but its checkpoint does not. A hash chain cannot detect its own tail being cut off, so truncation would go unreported.",
            "Verify the chain and investigate why the checkpoint is missing — every append writes it.",
          )
        : // Neither exists: a fresh installation, not a defect. Reporting this
          // as a warning would make every new deployment start amber and teach
          // operators to ignore the panel.
          check(
            "deployment.ledger_checkpoint",
            "Ledger checkpoint present",
            "pass",
            "No ledger has been written yet; the checkpoint is created with the first entry.",
          ),
  );

  // -------------------------------------------------------------------
  // The stated constraints.
  // -------------------------------------------------------------------
  checks.push(
    platform === "linux"
      ? check(
          "deployment.platform_linux",
          "Linux deployment target",
          "pass",
          "Running on Linux, as requirement #9 specifies.",
        )
      : // `warn`, not `fail`: running the CLI or the dashboard from a
        // workstation is legitimate and common. The requirement is about where
        // the system is *deployed*.
        check(
          "deployment.platform_linux",
          "Linux deployment target",
          "warn",
          `Running on ${platform}. Requirement #9 specifies a Linux deployment target; this is fine for development and is not a deployment.`,
        ),
  );

  const memoryGb = (totalMemoryBytes / 1000 ** 3).toFixed(1);
  checks.push(
    totalMemoryBytes >= MINIMUM_TOTAL_MEMORY_BYTES
      ? check(
          "deployment.memory_minimum",
          "Meets the 8 GB minimum",
          "pass",
          `${memoryGb} GB total memory.`,
        )
      : check(
          "deployment.memory_minimum",
          "Meets the 8 GB minimum",
          "fail",
          `${memoryGb} GB total memory; §1.4 sets a minimum of 8 GB.`,
          "Move to a host meeting the stated minimum specification.",
        ),
  );

  const disk = readDisk(home);
  checks.push(
    disk === null
      ? check(
          "deployment.governance_disk_space",
          "Room for the audit ledger to grow",
          "unknown",
          "Free space could not be determined on this platform.",
        )
      : disk.availableBytes >= LOW_DISK_BYTES
        ? check(
            "deployment.governance_disk_space",
            "Room for the audit ledger to grow",
            "pass",
            `${(disk.availableBytes / 1000 ** 3).toFixed(1)} GB available on the volume holding the governance directory.`,
          )
        : check(
            "deployment.governance_disk_space",
            "Room for the audit ledger to grow",
            "warn",
            `Only ${(disk.availableBytes / 1000 ** 2).toFixed(0)} MB available. The audit ledger is append-only and rotates rather than shrinking.`,
            "Free space on the volume holding the governance directory, or move it with OPENCLAW_GOVERNANCE_DIR.",
          ),
  );

  const folded = foldGatewayFindings(input.gatewayFindings);
  checks.push(...folded.checks);

  const summary = {
    pass: checks.filter((entry) => entry.status === "pass").length,
    warn: checks.filter((entry) => entry.status === "warn").length,
    fail: checks.filter((entry) => entry.status === "fail").length,
    unknown: checks.filter((entry) => entry.status === "unknown").length,
  };

  return {
    facts: {
      platform,
      totalMemoryBytes,
      bind: input.bind,
      port: input.port,
      authMode: input.authMode,
      tailscaleMode: input.tailscaleMode,
      governanceDir: shortenHomePath(home),
      governanceDirRelocated: Boolean(env.OPENCLAW_GOVERNANCE_DIR?.trim()),
      gatewayNotes: folded.notes,
    },
    checks,
    summary,
    // `unknown` is excluded on purpose: "we could not check three things here"
    // must not be able to turn a clean deployment amber, and it is reported
    // separately in `summary` so it cannot be hidden either.
    overall: summary.fail > 0 ? "fail" : summary.warn > 0 ? "warn" : "pass",
    sampledAt: now().toISOString(),
  };
}
