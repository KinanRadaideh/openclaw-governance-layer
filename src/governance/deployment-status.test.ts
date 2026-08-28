// Tests for backlog item A7 — the Root-tier deployment and network report.
//
// Almost everything here is driven through injected inputs rather than the real
// host, which is the point: the checks assert claims about a *deployment*, and a
// test that only passes on the developer's laptop asserts nothing about the VPS
// the report is for. Platform, memory, bind mode, port, file modes and free
// space are all supplied, so the whole table is verifiable on Windows CI and on
// Linux alike.
//
// Two tests deliberately touch the real filesystem, and both assert the *branch
// taken* rather than a value — see "dispatch" below.
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SecurityAuditFinding } from "../security/audit.types.js";
import {
  readDeploymentStatus,
  type DeploymentEnvironmentInput,
  type ReadDeploymentStatusOptions,
} from "./deployment-status.js";
import { ledgerCheckpointFilePath, ledgerFilePath } from "./paths.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-a7-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents([]);
  delete process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY;
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  delete process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY;
  await rm(dir, { recursive: true, force: true });
});

/** A deployment that matches the architecture §1.6 describes. */
function conformingInput(
  overrides: Partial<DeploymentEnvironmentInput> = {},
): DeploymentEnvironmentInput {
  return {
    bind: "loopback",
    port: 18789,
    authMode: "token",
    authSecretConfigured: true,
    tailscaleMode: "off",
    controlUiEnabled: true,
    hasNonLoopbackTrustedProxy: false,
    tlsEnabled: false,
    gatewayFindings: [],
    ...overrides,
  };
}

/**
 * Injected environment facts, so no assertion depends on the host running it.
 *
 * `statPath` is injected by default too, and that is not incidental. Claiming
 * `platform: "linux"` while letting the real filesystem answer means reading
 * *Windows* mode bits through the POSIX branch, which fails on Windows and
 * passes on Linux — a test that reports on the machine it ran on rather than on
 * the code. Tests that are actually about permissions override this; the one
 * test about platform dispatch removes the `platform` override instead.
 */
function options(overrides: ReadDeploymentStatusOptions = {}): ReadDeploymentStatusOptions {
  return {
    platform: "linux",
    totalMemoryBytes: 16 * 1000 ** 3,
    readDiskSpace: () => ({ availableBytes: 50 * 1000 ** 3, totalBytes: 100 * 1000 ** 3 }),
    // Truthful existence from the real filesystem, synthetic *modes*. Existence
    // is what the ledger and checkpoint checks are about, so faking it would
    // make those tests assert the fixture; modes are what Windows cannot
    // express, so reading those for real would make the rest host-dependent.
    statPath: async (path: string) => {
      try {
        await stat(path);
      } catch {
        return { exists: false, mode: null };
      }
      return { exists: true, mode: path === dir ? 0o40700 : 0o100600 };
    },
    ...overrides,
  };
}

async function statusOf(
  input: Partial<DeploymentEnvironmentInput> = {},
  opts: ReadDeploymentStatusOptions = {},
) {
  return readDeploymentStatus(TEST_GROUP, conformingInput(input), options(opts));
}

function checkFor(
  status: Awaited<ReturnType<typeof readDeploymentStatus>>,
  id: string,
): { status: string; detail: string; remediation?: string } {
  const found = status.checks.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`no check with id ${id}`);
  }
  return found;
}

describe("A7 — the report's shape", () => {
  it("gives every check an id, a title and an observation", async () => {
    const status = await statusOf();
    expect(status.checks.length).toBeGreaterThan(5);
    for (const entry of status.checks) {
      expect(entry.id, JSON.stringify(entry)).toMatch(/^[a-z][a-z0-9_.]+$/);
      expect(entry.title.length).toBeGreaterThan(3);
      expect(entry.detail.length).toBeGreaterThan(10);
      expect(["pass", "warn", "fail", "unknown"]).toContain(entry.status);
      // A remediation is only meaningful where something needs remedying.
      if (entry.status === "pass") {
        expect(entry.remediation, entry.id).toBeUndefined();
      }
    }
  });

  it("counts the summary from the checks it actually emitted", async () => {
    const status = await statusOf({ bind: "lan" });
    const counted = {
      pass: status.checks.filter((entry) => entry.status === "pass").length,
      warn: status.checks.filter((entry) => entry.status === "warn").length,
      fail: status.checks.filter((entry) => entry.status === "fail").length,
      unknown: status.checks.filter((entry) => entry.status === "unknown").length,
    };
    expect(status.summary).toEqual(counted);
    expect(Date.parse(status.sampledAt)).not.toBeNaN();
  });

  it("reports a fully conforming deployment as passing overall", async () => {
    // "Fully" includes the ledger key being held off-host. With the key on this
    // disk the report warns — correctly, and deliberately: that is the residual
    // risk `ledger-key.ts` documents, and a deployment view that stayed green
    // through it would be hiding the one thing an operator can still act on.
    process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY = "a-secret-from-a-vault";
    const status = await statusOf();
    expect(status.overall).toBe("pass");
    expect(status.summary.fail).toBe(0);
    expect(status.summary.warn).toBe(0);
  });

  it("warns — not fails — on an otherwise conforming deployment holding its key on disk", async () => {
    const status = await statusOf();
    expect(status.overall).toBe("warn");
    expect(status.summary.fail).toBe(0);
  });

  it("does not let an undeterminable check turn a clean deployment amber", async () => {
    // `unknown` is reported separately and excluded from `overall`. Three
    // checks that could not run on this platform must not read as a problem —
    // and must not be hidden either.
    const status = await statusOf({}, { platform: "win32" });
    expect(status.summary.unknown).toBeGreaterThan(0);
    expect(status.overall).not.toBe("fail");
  });
});

describe("A7 — the architecture claims from §1.6", () => {
  it.each([
    ["loopback" as const, "pass"],
    ["tailnet" as const, "warn"],
    ["lan" as const, "fail"],
    ["auto" as const, "fail"],
    ["custom" as const, "fail"],
  ])("reports bind %s as %s", async (bind, expected) => {
    const status = await statusOf({ bind });
    expect(checkFor(status, "deployment.bind_loopback").status).toBe(expected);
  });

  it.each([
    [18789, "loopback" as const, "pass"],
    [443, "loopback" as const, "warn"],
    [80, "lan" as const, "fail"],
    [443, "lan" as const, "fail"],
  ])("reports port %s on bind %s as %s", async (port, bind, expected) => {
    const status = await statusOf({ port, bind });
    expect(checkFor(status, "deployment.nonstandard_port").status).toBe(expected);
  });

  it("passes the tunnel check only when no other route in exists", async () => {
    expect(checkFor(await statusOf(), "deployment.tunnel_required").status).toBe("pass");
  });

  it.each([
    [{ bind: "lan" as const }, "lan"],
    [{ tailscaleMode: "serve" }, "Tailscale"],
    [{ hasNonLoopbackTrustedProxy: true }, "trusted proxy"],
    [{ tlsEnabled: true }, "TLS"],
  ])(
    "names the alternative route rather than saying no tunnel was detected",
    async (override, mentioned) => {
      const check = checkFor(await statusOf(override), "deployment.tunnel_required");
      expect(check.status).toBe("warn");
      // The detail must say what the other way in *is*. "No tunnel detected"
      // would be both unactionable and unverifiable — no process can observe
      // whether a human typed `ssh -L`.
      expect(check.detail).toContain(mentioned);
    },
  );

  it("fails when the gateway accepts unauthenticated connections", async () => {
    const status = await statusOf({ authMode: "none", authSecretConfigured: false });
    expect(checkFor(status, "deployment.gateway_auth").status).toBe("fail");
    expect(status.overall).toBe("fail");
  });
});

describe("A7 — the stated constraints", () => {
  it("accepts a genuine 8 GB host, which reports less than 8 GiB", async () => {
    // The regression test for the units trap. A vendor's "8 GB" VPS reports
    // roughly 7.6–7.9 GiB after firmware reservation, so a `1024 ** 3`
    // threshold would fail every real host the constraint was written for.
    const status = await statusOf({}, { totalMemoryBytes: Math.floor(7.9 * 1024 ** 3) });
    expect(checkFor(status, "deployment.memory_minimum").status).toBe("pass");
  });

  it("fails a host below the stated minimum", async () => {
    const status = await statusOf({}, { totalMemoryBytes: 4 * 1000 ** 3 });
    expect(checkFor(status, "deployment.memory_minimum").status).toBe("fail");
  });

  it("warns rather than fails away from Linux", async () => {
    // Running the CLI from a workstation is legitimate; requirement #9 is about
    // the deployment target. A `fail` here would cry wolf on every developer
    // machine and teach operators to ignore the report.
    const status = await statusOf({}, { platform: "darwin" });
    const check = checkFor(status, "deployment.platform_linux");
    expect(check.status).toBe("warn");
    expect(check.detail).toContain("darwin");
  });

  it("warns on a nearly full volume and reports unknown when it cannot tell", async () => {
    const low = await statusOf(
      {},
      { readDiskSpace: () => ({ availableBytes: 200 * 1000 ** 2, totalBytes: 10 * 1000 ** 3 }) },
    );
    expect(checkFor(low, "deployment.governance_disk_space").status).toBe("warn");
    const unavailable = await statusOf({}, { readDiskSpace: () => null });
    expect(checkFor(unavailable, "deployment.governance_disk_space").status).toBe("unknown");
  });
});

describe("A7 — governance state", () => {
  it("passes a fresh installation with no ledger and no checkpoint", async () => {
    // Neither file exists yet. Reporting that as a warning would make every new
    // deployment start amber for a condition that is simply "nothing has
    // happened yet".
    const status = await statusOf();
    expect(checkFor(status, "deployment.ledger_checkpoint").status).toBe("pass");
  });

  it("warns when a ledger exists without its checkpoint", async () => {
    await writeFile(ledgerFilePath(TEST_GROUP), "{}\n", "utf8");
    const status = await statusOf();
    const check = checkFor(status, "deployment.ledger_checkpoint");
    expect(check.status).toBe("warn");
    expect(check.detail).toMatch(/tail/i);
  });

  it("passes when both are present", async () => {
    await writeFile(ledgerFilePath(TEST_GROUP), "{}\n", "utf8");
    // Keyed by group since M5 — an empty object is a file with no checkpoint
    // for anybody, which is what "no checkpoint" now looks like.
    await writeFile(
      ledgerCheckpointFilePath(),
      JSON.stringify({ [TEST_GROUP]: { seq: 1, hash: "x", updatedAt: "now" } }),
      "utf8",
    );
    expect(checkFor(await statusOf(), "deployment.ledger_checkpoint").status).toBe("pass");
  });

  it("prefers a ledger key held off-host", async () => {
    expect(checkFor(await statusOf(), "deployment.ledger_key_source").status).toBe("warn");
    process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY = "a-secret-from-a-vault";
    expect(checkFor(await statusOf(), "deployment.ledger_key_source").status).toBe("pass");
  });

  it("reports the governance directory, and whether it was relocated", async () => {
    const status = await statusOf();
    expect(status.facts.governanceDirRelocated).toBe(true);
    expect(status.facts.governanceDir.length).toBeGreaterThan(0);
  });
});

describe("A7 — file permissions, tested without depending on the host's", () => {
  /**
   * Two layers, because `chmod` on Windows silently ignores group and world
   * bits. A test that chmods a real directory to 0700 and asserts `pass` is
   * meaningful on Linux and vacuous on Windows — it would pass either way.
   *
   * So the **logic** is driven through an injected `statPath` with synthetic
   * modes (full coverage, identical on both platforms), and one **dispatch**
   * test on the real filesystem asserts only which branch was taken.
   */
  const stat = (mode: number) => async () => ({ exists: true, mode });

  it.each([
    [0o40700, "pass"],
    [0o40750, "fail"],
    [0o40777, "fail"],
  ])("reads directory mode %s as %s", async (mode, expected) => {
    const status = await statusOf({}, { platform: "linux", statPath: stat(mode) });
    expect(checkFor(status, "deployment.governance_dir_permissions").status).toBe(expected);
  });

  it.each([
    [0o100600, "pass"],
    [0o100644, "fail"],
    [0o100660, "fail"],
  ])("reads file mode %s as %s", async (mode, expected) => {
    const status = await statusOf({}, { platform: "linux", statPath: stat(mode) });
    expect(checkFor(status, "deployment.governance_files_permissions").status).toBe(expected);
  });

  it("names the offending file by basename only, never its full path", async () => {
    const status = await statusOf({}, { platform: "linux", statPath: stat(0o100644) });
    const check = checkFor(status, "deployment.governance_files_permissions");
    expect(check.detail).not.toContain(dir);
  });

  it("dispatches to the platform's real answer", async () => {
    // Asserts the branch, never a mode value. On Windows the honest answer is
    // that POSIX bits are not meaningful; anywhere else a verdict is expected.
    //
    // Neither `platform` nor `statPath` is injected here — that is the whole
    // point of this one test, and injecting either would make it assert the
    // fixture rather than the dispatch.
    const status = await readDeploymentStatus(TEST_GROUP, conformingInput(), {
      totalMemoryBytes: 16 * 1000 ** 3,
      readDiskSpace: () => ({ availableBytes: 50 * 1000 ** 3, totalBytes: 100 * 1000 ** 3 }),
    });
    const observed = checkFor(status, "deployment.governance_dir_permissions").status;
    if (process.platform === "win32") {
      expect(observed).toBe("unknown");
    } else {
      expect(observed).not.toBe("unknown");
    }
  });
});

describe("A7 — folding in the host's own security audit", () => {
  const finding = (over: Partial<SecurityAuditFinding> = {}): SecurityAuditFinding => ({
    checkId: "gateway.bind_no_auth",
    severity: "critical",
    title: "Gateway exposed without auth",
    detail: "Bind is lan and no credential is configured.",
    remediation: "Configure gateway.auth.",
    ...over,
  });

  it("copies the audit's wording rather than re-authoring it", async () => {
    // The assertion that matters. Two components describing one condition in
    // different words is this project's most frequent defect shape, so the
    // wording is asserted equal to the source rather than merely present.
    const source = finding();
    const status = await statusOf({ gatewayFindings: [source] });
    const folded = status.checks.find((entry) => entry.id === source.checkId);
    expect(folded?.status).toBe("fail");
    expect(folded?.title).toBe(source.title);
    expect(folded?.detail).toBe(source.detail);
    expect(folded?.remediation).toBe(source.remediation);
    expect(folded?.source).toBe("gateway-audit");
  });

  it("maps severities without inventing a verdict for informational findings", async () => {
    const status = await statusOf({
      gatewayFindings: [
        finding({ checkId: "gateway.token_too_short", severity: "warn" }),
        finding({ checkId: "gateway.tailscale_serve", severity: "info", title: "Serve is on" }),
      ],
    });
    expect(checkFor(status, "gateway.token_too_short").status).toBe("warn");
    // An `info` finding states a fact and takes no position. Mapping it to
    // `pass` or `warn` would assert something the audit did not.
    expect(status.checks.some((entry) => entry.id === "gateway.tailscale_serve")).toBe(false);
    expect(status.facts.gatewayNotes).toContain("Serve is on");
  });

  it("reports an absent finding as a pass, which is what makes this a report", async () => {
    // `collectGatewayConfigFindings` only speaks when something is wrong.
    // Oversight has to be able to say that something is right, so absence is
    // converted into an explicit pass.
    const status = await statusOf({ gatewayFindings: [] });
    expect(checkFor(status, "gateway.bind_no_auth").status).toBe("pass");
  });

  it("surfaces a finding it was not expecting rather than dropping it", async () => {
    // A newly added host check must appear even though this module has never
    // heard of it; silently discarding it would be the same class of gap as
    // the registry that omitted three tools.
    const status = await statusOf({
      gatewayFindings: [finding({ checkId: "gateway.some_future_check", severity: "warn" })],
    });
    expect(checkFor(status, "gateway.some_future_check").status).toBe("warn");
  });
});

describe("A7 — secrets do not reach the report", () => {
  /**
   * The single most valuable test here. `resolveGatewayAuth` returns the
   * plaintext token and password on the same object as the mode, one field away
   * from what gets surfaced, and this response is served over HTTP.
   *
   * Deliberately **not** modelled on `system-status.test.ts`'s no-host-paths
   * assertion: that module is Viewer-tier and must leak no path at all, while
   * this one is Root-tier and reports the governance directory on purpose. Same
   * idea, different contract.
   */
  it("contains neither the gateway credential nor the ledger key", async () => {
    process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY = "ledger-key-from-a-vault";
    const status = await statusOf({ authMode: "token", authSecretConfigured: true });
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain("ledger-key-from-a-vault");
    expect(serialized).not.toContain("super-secret-token-value");
    // The mode is reported; the credential is not.
    expect(status.facts.authMode).toBe("token");
  });

  it("home-shortens the governance directory it reports", async () => {
    const status = await readDeploymentStatus(TEST_GROUP, conformingInput(), options());
    // Root may see where the directory is — that is the point of the check, and
    // QA round 13 finding 86 showed the location is materially important. What
    // it should not do is print an absolute home path when a `~` will do.
    expect(status.facts.governanceDir).not.toMatch(/\/home\/[a-z]/i);
  });
});
