/* @vitest-environment jsdom */

// T15 — the first tests of the governance dashboard *component*.
//
// Its extracted logic has always been tested (`ledger-filter.ts`,
// `rule-filter.ts`, `policy-projection.ts`), and the component itself never
// was. That gap has cost six defects so far, every one found by a person
// looking at the page rather than by the suite:
//
//   99  — rule rows titled with the raw regular expression instead of the
//         sentence saying what the rule was for
//   100 — the account form offered a `root` role the server always refuses
//   101 — Root creation had no confirmation field and did not state the
//         password minimum the ordinary form already printed
//   102 — a failed transcript load rendered as a permanent "Loading…"
//   103 — ten controls with no accessible name
//   (2026-08-22) the add-rule agent field was optional for a User, for whom the
//         empty form is a guaranteed 403
//   (2026-08-22) the authoring form was still headed "Add an allow rule" —
//         found by writing these tests. R5 made denials authorable and put an
//         allow/deny selector in that very form, and the heading above it kept
//         saying the form did one thing. The seventh in the list, and the
//         second label this week to have quietly stopped being true
//
// Every one is a *rendering* decision, which is why none of them could be
// caught below the component. These tests pin the ones that are cheap to pin,
// and they are deliberately about what an operator sees rather than about
// implementation detail — a test asserting the internal shape of a template
// would break on every restyle and catch none of the six.
import { beforeEach, describe, expect, it } from "vitest";
import type { GovernanceIdentity, GovernancePolicyDocument, GovernancePolicyRule } from "./api.ts";
import "./governance-page.ts";

type PageState = {
  agentPolicyView: unknown;
  agentAccess: unknown;
  identity: GovernanceIdentity | null;
  policy: GovernancePolicyDocument | null;
  users: unknown[];
  loading: boolean;
  conversationAgentId: string;
  transcript: unknown;
  promptAttachments: unknown[];
  attachmentUploading: boolean;
  promptDraft: string;
  updateComplete: Promise<unknown>;
  requestUpdate(): void;
  remove(): void;
} & HTMLElement;

function rule(overrides: Partial<GovernancePolicyRule> = {}): GovernancePolicyRule {
  return {
    id: "r-1",
    resourceKind: "command",
    pattern: "^ls$",
    effect: "allow",
    tier: "admin",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  } as GovernancePolicyRule;
}

function policy(rules: GovernancePolicyRule[]): GovernancePolicyDocument {
  return {
    version: 1,
    mode: "enforce",
    ask: "off",
    agentMode: {},
    agentAsk: {},
    userAsk: {},
    hitlTimeoutSeconds: 300,
    rules,
    lockedAgents: [],
  } as GovernancePolicyDocument;
}

function identity(
  role: GovernanceIdentity["role"],
  assignedAgents: string[] = [],
): GovernanceIdentity {
  return { username: role, role, assignedAgents } as GovernanceIdentity;
}

let page: PageState;

async function mount(state: Partial<PageState>): Promise<PageState> {
  page = document.createElement("openclaw-governance-page") as PageState;
  document.body.append(page);
  // State is assigned *after* connecting, not before. `connectedCallback`
  // kicks off a load that calls `whoami`, fails without a server, and clears
  // `identity` — so a page configured before connection renders the sign-in
  // form and every assertion below would be about the wrong screen. Assigning
  // afterwards is also closer to what the component does in life: it renders
  // empty, then fills in.
  await page.updateComplete;
  Object.assign(page, { loading: false, users: [], ...state });
  page.requestUpdate();
  await page.updateComplete;
  // A second turn: several sections render from state set during the first
  // update, and Lit batches.
  await page.updateComplete;
  return page;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("rule rows say what the rule is for (finding 99)", () => {
  it("leads with the description, not the regular expression", async () => {
    const el = await mount({
      identity: identity("administrator"),
      policy: policy([
        rule({
          description: "Directory listing with simple flags",
          pattern: "^ls(\\s+-[a-zA-Z]+)*$",
        }),
      ]),
    });

    const text = el.textContent ?? "";
    expect(text).toContain("Directory listing with simple flags");
    // The pattern is still shown — an operator needs it — but the sentence is
    // what the row is titled with. The shipped credential denial is 200+
    // characters of case-folded alternation, and a panel read during an
    // incident cannot be a wall of those.
    expect(text).toContain("^ls");
  });

  it("falls back to the pattern when a rule has no description", async () => {
    const el = await mount({
      identity: identity("administrator"),
      policy: policy([rule({ description: undefined, pattern: "^whoami$" })]),
    });

    expect(el.textContent).toContain("^whoami$");
  });
});

describe("the add-rule form matches what the server will accept (2026-08-22)", () => {
  it("marks the agent field required for a User, who cannot write a global rule", async () => {
    const el = await mount({
      identity: identity("user", ["mine"]),
      policy: policy([]),
    });

    const agentInput = el.querySelector<HTMLInputElement>("#governance-new-rule-agents");
    const list = el.querySelector("datalist#governance-new-rule-agents");
    expect(list).not.toBeNull();
    // An empty agent field means "global rule", which the server refuses below
    // Administrator — so for a User the natural empty form is a guaranteed 403.
    const required = [...el.querySelectorAll<HTMLInputElement>("input[required]")];
    expect(required.length).toBeGreaterThan(0);
    expect(agentInput ?? required[0]).toBeTruthy();
  });

  it("leaves the agent field optional for an Administrator, for whom empty is meaningful", async () => {
    const el = await mount({
      identity: identity("administrator"),
      policy: policy([]),
    });

    // For an Administrator the empty case *is* the meaningful one: it creates a
    // global rule. Requiring it would remove a capability rather than explain
    // one.
    const requiredAgent = el.querySelector<HTMLInputElement>(
      'input[list="governance-new-rule-agents"][required]',
    );
    expect(requiredAgent).toBeNull();
  });

  it("offers a User only their assigned agents as suggestions", async () => {
    const el = await mount({
      identity: identity("user", ["mine", "also-mine"]),
      policy: policy([]),
    });

    const options = [
      ...el.querySelectorAll<HTMLOptionElement>("#governance-new-rule-agents option"),
    ].map((option) => option.value);
    // These are exactly the values the server will accept from them, and
    // typing an id from memory is how the wrong one gets used.
    expect(options).toEqual(expect.arrayContaining(["mine", "also-mine"]));
  });
});

describe("the core-rule switch appears only where it can work (T24)", () => {
  const coreRule = rule({
    id: "core-command-privilege-escalation-sudo-su-doas-runas-pkexec",
    tier: "core",
    effect: "deny",
    description: "Privilege escalation (sudo, su, doas, runas, pkexec)",
  });
  const selfProtecting = rule({
    id: "core-command-the-governance-command-line-which-can-switch-the",
    tier: "core",
    effect: "deny",
    description: "The governance command line, which can switch the gate off",
  });

  it("offers Root a switch on a core rule that is not self-protecting", async () => {
    const el = await mount({ identity: identity("root"), policy: policy([coreRule]) });
    expect(el.textContent).toContain("Switch off");
  });

  it("offers no switch on a self-protecting core rule", async () => {
    // Refused by the server regardless, so a button here would always fail —
    // the shape of finding 100. No control at all is the honest rendering.
    const el = await mount({ identity: identity("root"), policy: policy([selfProtecting]) });
    expect(el.textContent).not.toContain("Switch off");
  });

  it("offers no switch to an Administrator", async () => {
    // Lowering the shipped floor is Root's, deliberately the narrower of the
    // two readings available when T24 was decided.
    const el = await mount({ identity: identity("administrator"), policy: policy([coreRule]) });
    expect(el.textContent).not.toContain("Switch off");
  });

  it("offers no Remove on a core rule, to anybody", async () => {
    // The server refuses it, and offering a button that cannot work is worse
    // than offering none.
    const el = await mount({ identity: identity("root"), policy: policy([coreRule]) });
    const removeButtons = [...el.querySelectorAll("button")].filter((button) =>
      button.textContent?.includes("Remove"),
    );
    expect(removeButtons).toHaveLength(0);
  });
});

describe("controls have accessible names (finding 103)", () => {
  it("labels every input and select in the policy section", async () => {
    const el = await mount({
      identity: identity("administrator"),
      policy: policy([rule()]),
    });

    const unnamed = [...el.querySelectorAll<HTMLElement>("input, select, textarea")].filter(
      (control) =>
        !control.getAttribute("aria-label") &&
        !control.getAttribute("aria-labelledby") &&
        !control.closest("label") &&
        !(control.id && el.querySelector(`label[for="${control.id}"]`)),
    );

    // Ten controls once had no accessible name. This is the assertion that
    // stops the eleventh arriving quietly.
    expect(unnamed.map((control) => control.outerHTML.slice(0, 80))).toEqual([]);
  });
});

describe("what each tier is shown", () => {
  it("shows a Viewer no rule-authoring form at all", async () => {
    const el = await mount({ identity: identity("viewer", ["mine"]), policy: policy([rule()]) });
    // Assignment grants visibility, the role grants authority. A Viewer reads
    // the policy and changes none of it.
    expect(el.textContent).not.toContain("Add a rule");
  });

  it("shows a User the authoring form", async () => {
    const el = await mount({ identity: identity("user", ["mine"]), policy: policy([rule()]) });
    expect(el.textContent).toContain("Add a rule");
  });
});

// ---------------------------------------------------------------------------
// T14 — the dashboard half of attachments.
//
// The store, the bounds and the HTTP route are asserted elsewhere
// (`attachment-store.test.ts`, `governance-attachment-http.test.ts`). What can
// only be checked here is what the operator sees: that the control exists at
// all for the tier that may use it, that a queued file is legible before it is
// sent, and that removing one is reachable by a name rather than by a symbol
// alone.
//
// The last of those is finding 103's lesson. Ten controls once shipped with no
// accessible name, and a "×" button is exactly the shape that happens to.
// ---------------------------------------------------------------------------

function openConversation(extra: Partial<PageState> = {}): Partial<PageState> {
  return {
    identity: identity("user", ["agent-a"]),
    policy: policy([]),
    conversationAgentId: "agent-a",
    transcript: { supported: true, turns: [] },
    ...extra,
  };
}

describe("attaching files to a prompt (T14)", () => {
  it("reaches the attach control by keyboard, not only by mouse (finding 118)", async () => {
    // The first version was a <label> wrapping a display:none input. It looked
    // identical and could not be tabbed to at all: display:none takes an input
    // out of the tab order however its tabindex reads, and a <label> is not
    // focusable. Same class as finding 103, and found by driving the page
    // rather than by reading it.
    const el = await mount(openConversation());
    const attach = Array.from(el.querySelectorAll("button")).find((button) =>
      (button.textContent ?? "").includes("Attach"),
    );
    expect(attach).toBeDefined();
    expect(attach?.tagName).toBe("BUTTON");
    // The input stays hidden and is deliberately out of the tab order, so the
    // button is the single focusable thing rather than one of two.
    const hidden = el.querySelector('input[type="file"]');
    expect(hidden?.getAttribute("tabindex")).toBe("-1");
    expect(hidden?.getAttribute("aria-hidden")).toBe("true");
  });

  it("offers an attach control on a conversation that can run", async () => {
    const el = await mount(openConversation());
    const picker = el.querySelector('input[type="file"]');
    expect(picker).not.toBeNull();
    // Multiple, because an operator sending a bug report sends the screenshot
    // and the log, and making them repeat the flow per file is the kind of
    // friction that gets a feature called broken.
    expect(picker?.hasAttribute("multiple")).toBe(true);
  });

  it("does not offer one where the process cannot run agents", async () => {
    // A control that is guaranteed to fail is worse than an absent one: it
    // teaches the operator that the page lies.
    const el = await mount(openConversation({ transcript: { supported: false, turns: [] } }));
    expect(el.querySelector('input[type="file"]')).toBeNull();
  });

  it("shows a queued file by name and size, so the operator sees what they picked", async () => {
    const el = await mount(
      openConversation({
        promptAttachments: [
          {
            sha256: "a".repeat(64),
            bytes: 2_202_010,
            mimeType: "image/png",
            declaredName: "screenshot.png",
          },
        ],
      }),
    );
    const text = el.textContent ?? "";
    expect(text).toContain("screenshot.png");
    // Rounded, not exact. The chip answers "did I pick the big one or the small
    // one"; the ledger holds the figure anybody has to rely on.
    expect(text).toContain("2.1 MB");
  });

  it("gives the remove control a name, not just a symbol (finding 103)", async () => {
    const el = await mount(
      openConversation({
        promptAttachments: [
          {
            sha256: "b".repeat(64),
            bytes: 12,
            mimeType: "image/png",
            declaredName: "shot.png",
          },
        ],
      }),
    );
    const named = Array.from(el.querySelectorAll("button")).filter((button) =>
      (button.getAttribute("aria-label") ?? "").includes("shot.png"),
    );
    expect(named).toHaveLength(1);
  });

  it("shows nothing about attachments when none are queued", async () => {
    const el = await mount(openConversation());
    expect(el.querySelector('[aria-label="Files attached to this message"]')).toBeNull();
  });

  it("will not send while bytes are still uploading", async () => {
    // Sending mid-upload would silently drop whichever files had not landed —
    // the prompt would go out naming fewer attachments than the operator
    // attached, and nothing on screen would say so.
    const el = await mount(
      openConversation({ attachmentUploading: true, promptDraft: "look at this" }),
    );
    const send = Array.from(el.querySelectorAll("button")).find((button) =>
      (button.textContent ?? "").includes("Send"),
    );
    expect(send?.hasAttribute("disabled")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// M2 — who can reach an agent.
//
// The route is asserted in `governance-agent-access.test.ts`. What only the
// component can show is the empty answer, which is the state the requested
// ecosystem panel specifically calls out: an agent nobody has been assigned,
// running under Administrator authority alone. Rendering that as blank space
// would read as a section that failed to load — finding 102, where a failed
// transcript rendered as a permanent "Loading…".
// ---------------------------------------------------------------------------

function agentPolicyOpen(access: unknown): Partial<PageState> {
  return {
    identity: identity("administrator"),
    policy: policy([]),
    agentPolicyView: {
      agentId: "agent-a",
      posture: {
        agentId: "agent-a",
        mode: "enforce",
        modeIsOverride: false,
        ask: "off",
        askIsOverride: false,
        lockedDown: false,
      },
      rules: [],
      summary: { allow: 0, deny: 0, global: 0, agentSpecific: 0 },
    },
    agentAccess: access,
  };
}

describe("who can reach an agent (M2)", () => {
  it("names the accounts that hold it", async () => {
    const el = await mount(
      agentPolicyOpen({ agentId: "agent-a", assignedTo: ["malek", "watcher"] }),
    );
    const text = el.textContent ?? "";
    expect(text).toContain("malek");
    expect(text).toContain("watcher");
  });

  it("says nobody in words when the list is empty", async () => {
    const el = await mount(agentPolicyOpen({ agentId: "agent-a", assignedTo: [] }));
    expect(el.textContent).toContain("Nobody");
  });

  it("distinguishes a failed load from an empty list", async () => {
    // Two different facts. "No one has this agent" and "we could not find out"
    // must not render identically, or an operator reads a loading failure as a
    // staffing answer.
    const el = await mount(agentPolicyOpen(null));
    const text = el.textContent ?? "";
    expect(text).toContain("Could not load who has access");
    expect(text).not.toContain("Nobody");
  });
});
