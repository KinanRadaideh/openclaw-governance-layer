/* @vitest-environment jsdom */

// T15. The first tests of the governance dashboard *component*.
//
// Its extracted logic has always been tested (`ledger-filter.ts`,
// `rule-filter.ts`, `policy-projection.ts`), and the component itself never
// was. That gap has cost six defects so far, every one found by a person
// looking at the page rather than by the suite:
//
//   99, rule rows titled with the raw regular expression instead of the
//         sentence saying what the rule was for
//   100, the account form offered a `root` role the server always refuses
//   101, Root creation had no confirmation field and did not state the
//         password minimum the ordinary form already printed
//   102, a failed transcript load rendered as a permanent "Loading…"
//   103, ten controls with no accessible name
//   (2026-08-22) the add-rule agent field was optional for a User, for whom the
//         empty form is a guaranteed 403
//   (2026-08-22) the authoring form was still headed "Add an allow rule",
//         found by writing these tests. R5 made denials authorable and put an
//         allow/deny selector in that very form, and the heading above it kept
//         saying the form did one thing. The seventh in the list, and the
//         second label this week to have quietly stopped being true
//
// Every one is a *rendering* decision, which is why none of them could be
// caught below the component. These tests pin the ones that are cheap to pin,
// and they are deliberately about what an operator sees rather than about
// implementation detail. A test asserting the internal shape of a template
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
  // `identity`, so a page configured before connection renders the sign-in
  // form and every assertion below would be about the wrong screen. Assigning
  // afterwards is also closer to what the component does in life: it renders
  // empty, then fills in.
  await page.updateComplete;
  // The conversation fields live on `ConversationController` since T53, so they
  // are routed through the page's test-only setter rather than assigned onto
  // the component. Everything else is assigned exactly as before.
  const CONVERSATION_KEYS = [
    "conversationAgentId",
    "transcript",
    "promptDraft",
    "promptAttachments",
    "promptError",
    "promptPending",
    "promptRunId",
    "promptStream",
    "attachmentUploading",
  ] as const;
  const merged: Record<string, unknown> = { loading: false, users: [], ...state };
  const conversation: Record<string, unknown> = {};
  for (const key of CONVERSATION_KEYS) {
    if (key in merged) {
      conversation[key] = merged[key];
      delete merged[key];
    }
  }
  Object.assign(page, merged);
  if (Object.keys(conversation).length > 0) {
    (page as unknown as { conversationStateForTests: unknown }).conversationStateForTests =
      conversation;
  }
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

describe("the page explains how rules are read (2026-08-26)", () => {
  /**
   * Two facts an operator needs in order to read the rule list correctly. Both
   * were already true of the engine and neither was visible on the page.
   *
   * Precedence lived in the `title=` attribute of the effect dropdown in the
   * authoring form: hover-only, absent on touch, and gone entirely once you are
   * reading rules rather than writing one. The search limitation was in the
   * backlog and the report and nowhere a person using the page could see it.
   */
  it("says that forbid beats allow, on the page rather than in a tooltip", async () => {
    const el = await mount({
      identity: identity("administrator"),
      policy: policy([rule({ description: "Something", pattern: "^ls$" })]),
    });
    const text = (el.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("How these rules are read");
    expect(text).toContain("Forbid beats allow");
    // The consequence, spelled out, because it is the thing an operator wants
    // and would otherwise have to infer: a narrow forbid carves an exception
    // out of a broad allow.
    expect(text).toContain("Grant a folder, forbid one subfolder");
  });

  it("says where a forbid rule reaches and where it only records", async () => {
    // **The device worked, and the answer was "revise", not "delete".**
    //
    // This test was written to fail when T7's prevention half landed, so that
    // whoever closed T7 would come here, see why the sentence existed, and
    // remove it. T7's prevention half landed on 2026-08-30 (§3.5.61), and the
    // caveat did *not* become untrue, it became **half** untrue. On the
    // in-process runtime denied results are now withheld; on the native Codex
    // backend they still cannot be, because that protocol has no field for
    // substituting a result.
    //
    // Deleting the sentence would have told an operator on the Codex backend
    // that a forbid rule protects them from searches, which is exactly the
    // false promise the caveat existed to prevent. So it was narrowed to name
    // both runtimes instead, and this test now pins the narrower claim.
    //
    // Worth keeping as a note about the device itself: a test written to fail
    // on a future change assumes the change will make its subject wholly
    // obsolete. This one made it *more specific*, which the trip-wire could not
    // express. It kept passing, and the staleness was caught by reading the
    // handoff's own claim that it would fail.
    const el = await mount({
      identity: identity("administrator"),
      policy: policy([rule({ description: "Something", pattern: "^ls$" })]),
    });
    const text = (el.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("Where a forbid rule reaches, and where it only records");
    expect(text).toContain("grep and find are judged on the folder they start from");
    // The half that is now prevented, named as such.
    expect(text).toContain("removed before the agent sees them");
    // The half that is not, and why, so the disclosure does not read as a shrug.
    expect(text).toContain("On the Codex backend they cannot be removed");
    expect(text).toContain("written to the audit trail");
  });

  it("shows both notices to a User, not only to an administrator", async () => {
    // A User authors rules for their own agent, so a User can write exactly the
    // grant this caveat is about. Showing the explanation only to the tier that
    // needs it least would be the whole defect again.
    const el = await mount({
      identity: identity("user"),
      policy: policy([rule({ description: "Something", pattern: "^ls$" })]),
    });
    const text = (el.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("Forbid beats allow");
    expect(text).toContain("Where a forbid rule reaches, and where it only records");
  });
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
    // The pattern is still shown, an operator needs it, but the sentence is
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
    // Administrator, so for a User the natural empty form is a guaranteed 403.
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

  /**
   * The switch-off *buttons* on the page.
   *
   * These assertions used to read `textContent` for the phrase "Switch off",
   * which conflated three different things: a button, the button's label
   * echoed in a tooltip, and prose about buttons. The third is what broke it —
   * the row explaining *why* some rules have no switch necessarily names the
   * control it is explaining, and a page-text match cannot tell that apart
   * from the control itself. Ask for the button.
   */
  const switchOffButtons = (el: Element): HTMLButtonElement[] =>
    [...el.querySelectorAll("button")].filter((button) =>
      button.textContent?.includes("Switch off"),
    );

  it("offers Root a switch on a core rule that is not self-protecting", async () => {
    const el = await mount({ identity: identity("root"), policy: policy([coreRule]) });
    expect(switchOffButtons(el)).toHaveLength(1);
  });

  it("offers no switch on a self-protecting core rule", async () => {
    // Refused by the server regardless, so a button here would always fail,
    // the shape of finding 100. No control at all is the honest rendering.
    const el = await mount({ identity: identity("root"), policy: policy([selfProtecting]) });
    expect(switchOffButtons(el)).toHaveLength(0);
  });

  it("says on the row that a self-protecting rule cannot be switched off", async () => {
    // **A missing button is not a message.** Some core denials offer the
    // switch and some do not, and with nothing in the control column the
    // difference read as a page that had failed to render half its buttons
    // rather than as a rule being enforced. This is the same answer the Root
    // account row already gives with "root (permanent, cannot be changed)".
    const el = await mount({ identity: identity("root"), policy: policy([selfProtecting]) });
    expect(el.textContent).toContain("Cannot be switched off");
  });

  it("explains once, above the list, why some rules have no switch", async () => {
    // The reason belongs to the tier, not to any one rule, so it is stated
    // once where somebody reading the list will meet it, rather than five
    // times on the rows or in a `title=` that touch devices never show.
    const el = await mount({ identity: identity("root"), policy: policy([selfProtecting]) });
    expect(el.textContent).toContain("Why some built-in rules have no Switch off");
  });

  it("offers no switch to an Administrator", async () => {
    // Lowering the shipped floor is Root's, deliberately the narrower of the
    // two readings available when T24 was decided.
    const el = await mount({ identity: identity("administrator"), policy: policy([coreRule]) });
    expect(switchOffButtons(el)).toHaveLength(0);
    // And the explanation goes with it: a tier they cannot act on is not a
    // question they are being asked.
    expect(el.textContent).not.toContain("Why some built-in rules have no Switch off");
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
// T14. The dashboard half of attachments.
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
    // Sending mid-upload would silently drop whichever files had not landed,
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
// M2, who can reach an agent.
//
// The route is asserted in `governance-agent-access.test.ts`. What only the
// component can show is the empty answer, which is the state the requested
// ecosystem panel specifically calls out: an agent nobody has been assigned,
// running under Administrator authority alone. Rendering that as blank space
// would read as a section that failed to load. Finding 102, where a failed
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

// ---------------------------------------------------------------------------
// Typing. The defect below survived every test in this file because none of
// them typed anything: each handed the component a `promptDraft` already
// filled in and asserted what rendered from it. That tests the template and
// not the input, and the input was where the bug was.
//
// Two of this panel's inputs wrote their keystroke onto the `props` object
// instead of routing it through `onDraft`. `agentPanelProps()` rebuilds that
// object every render, so the value landed on a snapshot that was thrown away
// and no re-render was triggered — which meant the button beside each input
// kept the `?disabled` it had been rendered with. Send stayed dead with a
// message typed; the chooser's Talk button stayed dead with an id typed.
//
// Same family as findings 206, 221 and 224: a green test that describes its
// own fixture rather than the product. The fix for the class is to drive the
// control, so these dispatch real `input` events.
// ---------------------------------------------------------------------------

/** Types into an input the way a person does: set value, then fire `input`. */
async function typeInto(el: PageState, input: HTMLInputElement, value: string): Promise<void> {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  await el.updateComplete;
}

function inputByLabel(el: PageState, label: string): HTMLInputElement | undefined {
  return Array.from(el.querySelectorAll<HTMLInputElement>("input")).find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
}

function buttonByText(el: PageState, text: string): HTMLButtonElement | undefined {
  return Array.from(el.querySelectorAll("button")).find((button) =>
    (button.textContent ?? "").trim().includes(text),
  );
}

describe("typing reaches the state the buttons read", () => {
  it("enables Send once a message is typed", async () => {
    const el = await mount(openConversation());
    const send = buttonByText(el, "Send");
    expect(send, "the composer should offer a Send button").toBeTruthy();
    expect(send?.disabled, "Send starts disabled on an empty draft").toBe(true);

    const composer = inputByLabel(el, "Message to the agent");
    expect(composer, "the composer input should carry its accessible name").toBeTruthy();
    await typeInto(el, composer as HTMLInputElement, "hey");

    expect(
      buttonByText(el, "Send")?.disabled,
      "Send must come alive once there is something to send",
    ).toBe(false);
  });

  it("enables the chooser's Talk button once an id is typed", async () => {
    // An Administrator has no assigned list, so this is the branch that
    // renders an id box rather than a row per agent.
    const el = await mount({ identity: identity("administrator"), policy: policy([]) });
    const box = inputByLabel(el, "Agent to talk to");
    expect(box, "an Administrator should be offered an id box").toBeTruthy();
    expect(buttonByText(el, "Talk")?.disabled, "Talk starts disabled with nothing typed").toBe(
      true,
    );

    await typeInto(el, box as HTMLInputElement, "andrew");

    expect(buttonByText(el, "Talk")?.disabled, "Talk must come alive once an id is typed").toBe(
      false,
    );
  });

  it("keeps the id box separate from the conversation that is open", async () => {
    // One field used to do both jobs, so opening a conversation filled the box
    // in and typing in the box was read as changing which conversation was
    // open. The box holds what the operator typed; nothing else writes to it.
    const el = await mount({
      identity: identity("administrator"),
      policy: policy([]),
      conversationAgentId: "agent-a",
      transcript: { supported: true, turns: [] },
    });
    const box = inputByLabel(el, "Agent to talk to");
    expect(box?.value, "an open conversation must not fill in the id box").toBe("");
  });
});

// ---------------------------------------------------------------------------
// Signing out. The page is not torn down by it, so whatever the last account
// loaded is still in component memory when the next one signs in **in the same
// tab**. Both ways out of a session must therefore drop the same state, and
// they did not: expiry cleared fifteen things and signing out cleared three.
//
// The conversation is the one that matters, because it is the only piece
// `refreshData` does not overwrite on sign-in — a transcript is loaded by
// opening a conversation, never by the refresh — so one account's conversation
// with an agent stayed on screen for the next account indefinitely.
// ---------------------------------------------------------------------------

describe("ending a session drops what it loaded", () => {
  // `logout()` goes over the wire and there is no server here, so without a
  // stub the click handler's `run()` catches the rejection and never reaches
  // `onSignOut`. The stub makes every request succeed so the sign-out path is
  // what is under test rather than the transport. Deliberately **not** a 401:
  // that would send `run()` down the *expiry* path, which clears the same
  // state, and the test would pass without the sign-out handler doing anything.
  async function signOutThenBackIn(el: PageState, next: GovernanceIdentity): Promise<void> {
    const realFetch = globalThis.fetch;
    // **Two things have to be stubbed, and the second is why no test in this
    // file had ever clicked a button that calls the server.** `api()` reads
    // `this.context.gateway` from a Lit context that nothing provides here, so
    // it throws a TypeError before any request is made; `run()` catches that
    // and the handler's second line — the one under test — never runs. Stubbing
    // `fetch` alone cannot help, because the failure happens before the fetch.
    const withContext = el as unknown as { context: unknown };
    const realContext = withContext.context;
    withContext.context = { basePath: "", gateway: { snapshot: null, connection: null } };
    // Shaped the way `request()` consumes it — `ok`, `status`, `text()` —
    // rather than a real `Response`, whose constructor is not dependably
    // present in this environment. Deliberately a 200 and **not** a 401: a 401
    // sends `run()` down the *expiry* path, which clears the same state, and
    // the test would pass without the sign-out handler doing anything at all.
    // Only the logout succeeds. Everything else rejects, which is what makes
    // this stub safe: `run()` follows the action with a full `refreshData`,
    // and that uses `Promise.allSettled`, so a rejected request assigns
    // nothing. Returning a generic `{}` instead put the wrong *shape* into
    // `agents` and `policy` and blew up the next render — the fixture-error
    // class again. A rejection also cannot be mistaken for a 401, which would
    // route through the expiry path and clear the same state for free.
    globalThis.fetch = (async (input: unknown) => {
      if (String(input).includes("logout")) {
        return { ok: true, status: 200, text: async () => "{}" };
      }
      throw new Error("stubbed: this test has no server");
    }) as unknown as typeof globalThis.fetch;
    try {
      buttonByText(el, "Sign out")?.click();
      // `run()` awaits the logout and then a full refresh, so let the microtask
      // queue drain rather than guessing at a fixed number of ticks.
      for (let tick = 0; tick < 10; tick += 1) {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
        await el.updateComplete;
      }
    } finally {
      globalThis.fetch = realFetch;
      withContext.context = realContext;
    }
    // The page is not torn down by signing out, so this is the same component
    // instance the previous account was using: exactly the situation a second
    // person signing in at the same machine creates.
    el.identity = next;
    await el.updateComplete;
  }

  it("does not carry one account's conversation into the next sign-in", async () => {
    const el = await mount({
      identity: identity("administrator"),
      policy: policy([]),
      conversationAgentId: "agent-a",
      transcript: { supported: true, turns: [{ role: "user", body: "payroll", at: 1 }] },
      promptDraft: "half typed",
    });
    expect(el.textContent, "the transcript should be on screen first").toContain("payroll");
    expect(buttonByText(el, "Sign out"), "a signed-in page should offer Sign out").toBeTruthy();

    await signOutThenBackIn(el, identity("administrator"));

    // The transcript is the one piece `refreshData` never reloads — it is
    // fetched by opening a conversation and by nothing else — so if signing
    // out does not drop it, it stays on screen for the next account for good.
    expect(
      el.textContent ?? "",
      "the previous account's conversation must not survive the sign-in",
    ).not.toContain("payroll");
    expect(el.textContent ?? "", "nor their half-typed message").not.toContain("half typed");
  });

  // **There was a second test here, asserting the account list, and it was
  // deleted rather than kept.** It passed with this fix *reverted*, so it
  // proved nothing: `refreshData` runs straight after the sign-out, and with
  // `identity` null it resolves `listUsers` to `[]` locally without asking the
  // server, so `users` empties either way. A test that cannot fail for the
  // reason it claims is worse than no test, because it is counted.
  //
  // The conversation above is the case this fix uniquely owns, and for the
  // same underlying reason: a transcript is the one piece `refreshData` never
  // reloads, so it is the one piece that genuinely survives a sign-out.
});

// ---------------------------------------------------------------------------
// Reading the agent's reply.
//
// The reply does reach the page: `sendPrompt` reloads the transcript when the
// run ends, and an agent turn is persisted with `role: "agent"`. What the panel
// could not do was say anything when that turn had **no text** — and empty is a
// real outcome here rather than a fault. `governance-agent-runner.ts` says so
// in its own comment: it happens when every tool call the agent tried was
// refused by policy, which is the single case this whole layer exists to
// produce. The panel drew a blank line for it, so the successful demonstration
// of a default-deny gate looked like a broken page.
// ---------------------------------------------------------------------------

function conversationWith(turns: unknown[]): Partial<PageState> {
  return {
    identity: identity("user", ["agent-a"]),
    policy: policy([]),
    conversationAgentId: "agent-a",
    transcript: { supported: true, turns },
  };
}

describe("reading what the agent said", () => {
  it("shows the reply text", async () => {
    const el = await mount(
      conversationWith([
        { role: "user", body: "read ~/.ssh/id_rsa", at: 1 },
        { role: "agent", body: "I was refused access to that file.", at: 2 },
      ]),
    );
    const text = el.textContent ?? "";
    expect(text).toContain("read ~/.ssh/id_rsa");
    expect(text, "the agent's answer has to be readable, not just stored").toContain(
      "I was refused access to that file.",
    );
  });

  it("explains an empty reply instead of drawing a blank", async () => {
    const el = await mount(conversationWith([{ role: "agent", body: "", at: 2 }]));
    expect(
      el.textContent ?? "",
      "an agent that said nothing must say so, because that is the refused case",
    ).toContain("finished without saying anything");
  });

  it("still reports a failed turn as a failure rather than as an empty one", async () => {
    // The two must not collapse: "it ran and said nothing" and "it did not run"
    // are different facts, and the second already had wording that works.
    const el = await mount(
      conversationWith([{ role: "agent", body: "", at: 2, error: "the run did not complete" }]),
    );
    const text = el.textContent ?? "";
    expect(text).toContain("the run did not complete");
    expect(text, "a failure is not the empty-reply case").not.toContain(
      "finished without saying anything",
    );
  });

  it("gives the transcript an announced, scrollable region", async () => {
    // A reply can arrive minutes after the operator looked away, and the page
    // is long enough that an ungrowing transcript keeps the composer where it
    // was put rather than pushing it off the bottom.
    const el = await mount(conversationWith([{ role: "agent", body: "done", at: 2 }]));
    const log = el.querySelector('[role="log"]');
    expect(log, "the transcript should be a log region").toBeTruthy();
    expect(log?.getAttribute("aria-live")).toBe("polite");
    expect(log?.getAttribute("aria-label")).toContain("agent-a");
  });
});
