// Finding 385. Another agent's workspace nested inside this agent's is not this
// agent's project.
//
// Onboarding writes `agents.defaults.workspace`, and OpenClaw then places every
// other agent at `<that workspace>/<id>`. The canonical path form renders
// anything under the calling agent's workspace as workspace-relative, and the
// shipped baseline allows reading any workspace-relative path, so the default
// agent could read every other agent's files without asking. Found live: a User
// who was never assigned `gamma` read `gamma`'s notes by prompting `main`.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearRuntimeConfigSnapshot,
  setRuntimeConfigSnapshot,
} from "../config/runtime-snapshot.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { resolveGovernedPath } from "./path-normalize.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { filterSearchResult } from "./search-audit.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;
let workspace: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-nested-ws-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = join(dir, "gov");
  await seedGroupWithAgents(["main", "gamma"]);
  resetLedgerKeyCacheForTests();
  workspace = join(dir, "workspace");
  await mkdir(join(workspace, "gamma"), { recursive: true });
  await mkdir(join(workspace, "reports"), { recursive: true });
  await writeFile(join(workspace, "gamma", "notes.txt"), "gamma's private notes\n");
  await writeFile(join(workspace, "reports", "weekly.md"), "main's own report\n");
  // The shape onboarding writes: a default workspace, and a second agent with none of
  // its own, which OpenClaw therefore places inside the first.
  setRuntimeConfigSnapshot({
    agents: {
      defaults: { workspace },
      entries: { main: { default: true }, gamma: { name: "gamma" } },
    },
  } as unknown as OpenClawConfig);
});

afterEach(async () => {
  clearRuntimeConfigSnapshot();
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

const mainCtx = () => ({ agentId: "main", sessionKey: "agent:main:main", cwd: workspace });

describe("finding 385: a nested agent workspace is outside the enclosing agent's project", () => {
  it("does not let the default agent read another agent's files under the baseline", async () => {
    const decision = await evaluateGovernancePolicy(
      { toolName: "read", params: { path: "gamma/notes.txt" } },
      mainCtx(),
    );
    // Not silently allowed: with the shipped `ask: on-miss` it escalates to a person.
    expect(decision).toBeDefined();
  });

  it("still lets the default agent read its own files", async () => {
    const decision = await evaluateGovernancePolicy(
      { toolName: "read", params: { path: "reports/weekly.md" } },
      mainCtx(),
    );
    expect(decision).toBeUndefined();
  });

  it("renders a path inside a nested root absolute, and a lookalike sibling relative", async () => {
    const roots = [join(workspace, "gamma")];
    const inside = await resolveGovernedPath("gamma/notes.txt", workspace, roots);
    expect(inside.resource).toMatch(/^([A-Za-z]:\/|\/)/);
    expect(inside.resource.endsWith("/gamma/notes.txt")).toBe(true);
    const sibling = await resolveGovernedPath("gammas/x.txt", workspace, roots);
    expect(sibling.resource).toBe("gammas/x.txt");
    const root = await resolveGovernedPath("gamma", workspace, roots);
    expect(root.resource).toMatch(/^([A-Za-z]:\/|\/)/);
  });

  it("still lets the nested agent read its own files", async () => {
    // The enclosing workspace contains this one, and must not be treated as foreign
    // to it, or the nested agent would be fenced out of its own folder.
    const decision = await evaluateGovernancePolicy(
      { toolName: "read", params: { path: "notes.txt" } },
      { agentId: "gamma", sessionKey: "agent:gamma:main", cwd: join(workspace, "gamma") },
    );
    expect(decision).toBeUndefined();
  });

  it("withholds a nested agent's files from the enclosing agent's search", async () => {
    // A recursive search rooted at the default agent's workspace reads everything
    // beneath it; the gate judges only the root. T7's filter is what stops the lines.
    const filtered = await filterSearchResult({
      toolName: "grep",
      toolParams: { path: "." },
      agentId: "main",
      sessionKey: "agent:main:main",
      cwd: workspace,
      result: {
        content: [
          {
            type: "text",
            text: ["reports/weekly.md:1:main's own report", "gamma/notes.txt:1:private"].join("\n"),
          },
        ],
      },
    });
    const text = JSON.stringify(filtered);
    expect(text).toContain("reports/weekly.md");
    expect(text).not.toContain("gamma/notes.txt:1:private");
  });

  it("changes nothing when no configuration snapshot is loaded", async () => {
    clearRuntimeConfigSnapshot();
    const decision = await evaluateGovernancePolicy(
      { toolName: "read", params: { path: "gamma/notes.txt" } },
      mainCtx(),
    );
    expect(decision).toBeUndefined();
  });
});
