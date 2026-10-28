/* @vitest-environment jsdom */

// The dashboard QA of 2026-10-27: does the page follow common web practice, and does
// what it offers work (`mg/QA-SESSION-2026-10-27.md`).
//
// Every case was seen on the running Gateway first and is pinned here as an operator
// meets it. Each fix was then undone in turn to see these tests fail (the session log
// records the sweep).
import { render } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import type { GovernanceLedgerEntry, GovernanceLedgerVerification } from "./api.ledger.ts";
import type { GovernanceIdentity, GovernancePolicyDocument, GovernancePolicyRule } from "./api.ts";
import { ENTER_SUBMITS, submitOnEnter } from "./enter-submits.ts";
import { afterPageUpdate } from "./page-focus.ts";
import { renderLedgerSection } from "./panels/oversight-panels.ts";
import { scrollToSection } from "./panels/section-nav.ts";
import "./governance-page.ts";

type PageState = {
  identity: GovernanceIdentity | null;
  policy: GovernancePolicyDocument | null;
  loading: boolean;
  updateComplete: Promise<unknown>;
  requestUpdate(): void;
} & HTMLElement;

const ROOT: GovernanceIdentity = { username: "root", role: "root", assignedAgents: [] };

function policy(rules: GovernancePolicyRule[] = []): GovernancePolicyDocument {
  return {
    version: 4,
    mode: "enforce",
    ask: "on-miss",
    agentMode: {},
    agentAsk: {},
    userAsk: {},
    hitlTimeoutSeconds: 300,
    rules,
    lockedAgents: [],
  } as unknown as GovernancePolicyDocument;
}

async function mount(state: Record<string, unknown>): Promise<PageState> {
  const page = document.createElement("openclaw-governance-page") as PageState;
  document.body.replaceChildren(page);
  await page.updateComplete;
  Object.assign(page, { loading: false, users: [], ...state });
  page.requestUpdate();
  await page.updateComplete;
  await page.updateComplete;
  return page;
}

function buttonNamed(root: ParentNode, label: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === label,
  );
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("finding 440: focus returns into a form the page rebuilt", () => {
  // Seen live: Add rule and Create account sit under a list. The list grew by one, the
  // form moved one place in its section, Lit built it anew, and focus fell to the
  // document (Add rule) or jumped to the kill switch's field two sections away (Create
  // account), the newest remembered control still on the page.
  function form(): HTMLElement {
    const row = document.createElement("div");
    row.className = "settings-row";
    row.innerHTML = `<input aria-label="New account password" /><button>Create account</button>`;
    return row;
  }

  function setUp() {
    const host = document.createElement("div");
    host.innerHTML = `<div class="governance-page__body">
      <input aria-label="Lock down an agent" /><div id="accounts"></div></div>`;
    document.body.replaceChildren(host);
    const accounts = host.querySelector("#accounts")!;
    accounts.append(form());
    afterPageUpdate(host, null, false);
    host.querySelector<HTMLInputElement>('[aria-label="Lock down an agent"]')!.focus();
    host.querySelector<HTMLInputElement>('[aria-label="New account password"]')!.focus();
    buttonNamed(host, "Create account")!.focus();
    return { host, accounts };
  }

  it("puts focus in the rebuilt form's field, not on an older control elsewhere", () => {
    const { host, accounts } = setUp();
    buttonNamed(host, "Create account")!.blur();
    afterPageUpdate(host, null, true);
    // The account list grew: a new row before the form, and the form rebuilt, cleared,
    // so its button is disabled until something is typed again.
    const rebuilt = form();
    rebuilt.querySelector("button")!.disabled = true;
    accounts.replaceChildren(document.createElement("div"), rebuilt);
    afterPageUpdate(host, null, false);
    expect(document.activeElement).toBe(rebuilt.querySelector("input"));
  });

  it("stands a removed row's button in with the button now in its place", () => {
    // Seen live: Remove on a rule, confirmed. The rule went with its button.
    const host = document.createElement("div");
    host.innerHTML = `<div class="governance-page__body">
      <button>Remove</button><button>Remove</button><button>Remove</button></div>`;
    document.body.replaceChildren(host);
    afterPageUpdate(host, null, false);
    const buttons = [...host.querySelectorAll("button")];
    const second = buttons[1]!;
    const third = buttons[2]!;
    second.focus();
    second.blur();
    afterPageUpdate(host, null, true);
    second.remove();
    afterPageUpdate(host, null, false);
    expect(document.activeElement).toBe(third);
  });
});

describe("finding 449: a conversation opened by Enter takes the cursor", () => {
  // QA of 2026-10-28, live: Enter in "Or type an agent id" opened the conversation and
  // left the cursor in that field; Talk, which the conversation replaces, moved it.
  function setUp() {
    const host = document.createElement("div");
    host.innerHTML = `<div class="governance-page__body">
      <section class="settings-section" id="agents"><input aria-label="Or type an agent id" /></section>
      <section class="settings-section" id="policy"><input aria-label="Rule pattern" /></section></div>`;
    document.body.replaceChildren(host);
    afterPageUpdate(host, null, false);
    return host;
  }

  function open(host: HTMLElement): HTMLTextAreaElement {
    const conversation = document.createElement("div");
    conversation.className = "governance-conversation";
    conversation.innerHTML = `<div role="log"></div><textarea aria-label="Message to the agent"></textarea>`;
    host.querySelector("#agents")!.append(conversation);
    afterPageUpdate(host, null, false);
    return conversation.querySelector("textarea")!;
  }

  it("moves the cursor from the field that opened it to the message box", () => {
    const host = setUp();
    host.querySelector<HTMLInputElement>('[aria-label="Or type an agent id"]')!.focus();
    const composer = open(host);
    expect(document.activeElement).toBe(composer);
  });

  it("leaves an operator working in another section where they are", () => {
    const host = setUp();
    const elsewhere = host.querySelector<HTMLInputElement>('[aria-label="Rule pattern"]')!;
    elsewhere.focus();
    open(host);
    expect(document.activeElement).toBe(elsewhere);
  });
});

describe("finding 441: removing a forbid rule is not called removing a permission", () => {
  function rule(effect: "allow" | "deny"): GovernancePolicyRule {
    return {
      id: `rule-${effect}`,
      resourceKind: "command",
      pattern: `^echo ${effect}$`,
      description: `QA ${effect} rule`,
      createdAt: new Date().toISOString(),
      createdBy: "root",
      effect,
    };
  }

  async function confirmationFor(effect: "allow" | "deny"): Promise<string> {
    const page = await mount({ identity: ROOT, policy: policy([rule(effect)]) });
    const row = [...page.querySelectorAll(".settings-row")].find((candidate) =>
      candidate.textContent?.includes(`QA ${effect} rule`),
    )!;
    buttonNamed(row, "Remove")!.click();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    const dialog = document.querySelector("openclaw-modal-dialog");
    const text = dialog?.querySelector(".exec-approval-sub")?.textContent ?? "";
    buttonNamed(dialog!, "Cancel")!.click();
    return text;
  }

  it("says the agent will no longer be stopped by a forbid rule", async () => {
    const text = await confirmationFor("deny");
    expect(text).toContain("Remove this restriction?");
    expect(text).not.toContain("no longer be allowed");
  });

  it("still calls an allow rule a permission", async () => {
    const text = await confirmationFor("allow");
    expect(text).toContain("Remove this permission?");
  });
});

// Finding 442 (the notice style) is a stylesheet rule: `dashboard-qa-2026-10-27-styles.test.ts`.

function entry(patch: Partial<GovernanceLedgerEntry>): GovernanceLedgerEntry {
  return {
    seq: 1,
    timestamp: new Date().toISOString(),
    agentId: "main",
    sessionKey: "s",
    toolName: "governance.agent.prompt",
    resourceKind: "prompt",
    resource: "prompt from the dashboard",
    ruleId: "",
    decision: "allow",
    prevHash: "",
    hash: "",
    entryKind: "admin",
    ...patch,
  };
}

function ledger(
  entries: GovernanceLedgerEntry[],
  verification: GovernanceLedgerVerification | null = null,
): HTMLElement {
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  render(
    renderLedgerSection({
      ledger: entries,
      ledgerFilter: "all",
      verification,
      busy: false,
      onFilter: () => {},
      onVerify: () => {},
    }),
    host,
  );
  return host;
}

describe("finding 443: secondary text is muted by colour, not by opacity", () => {
  // Opacity over the already muted colour measured 4.12:1 (dark) and 3.96:1 (light) on the
  // ledger, and 3.44:1 for the conversation's times on light; the minimum is 4.5:1.
  it("leaves the ledger's intent and re-check lines at full opacity", () => {
    const host = ledger([entry({ intent: "I will list the folder" })], {
      ok: true,
      entriesChecked: 1,
      evidence: { headSeq: 1, headHash: "a".repeat(64), keyed: true },
    });
    expect(host.textContent).toContain("I will list the folder");
    expect(host.querySelectorAll('[style*="opacity"]')).toHaveLength(0);
  });

  it("leaves the conversation's times at full opacity", async () => {
    const page = await mount({
      identity: { username: "lina", role: "user", assignedAgents: ["main"] },
      policy: policy(),
    });
    (page as unknown as { conversationStateForTests: unknown }).conversationStateForTests = {
      conversationAgentId: "main",
      transcript: {
        supported: true,
        turns: [
          { role: "user", body: "hello", at: 1 },
          { role: "agent", body: "", at: 2 },
        ],
      },
    };
    page.requestUpdate();
    await page.updateComplete;
    const log = page.querySelector('[role="log"]');
    expect(log).not.toBeNull();
    expect(log!.querySelectorAll('[style*="opacity"]')).toHaveLength(0);
  });
});

describe("finding 444: Enter in a form's field presses the form's button", () => {
  function row(html: string) {
    const host = document.createElement("div");
    host.innerHTML = `<div class="settings-row">${html}</div>`;
    document.body.replaceChildren(host);
    host.addEventListener("keydown", submitOnEnter);
    const pressed = vi.fn();
    for (const button of host.querySelectorAll("button")) {
      button.addEventListener("click", () => pressed(button.textContent));
    }
    return { host, pressed };
  }

  function enter(field: Element, init: KeyboardEventInit = {}) {
    field.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init }),
    );
  }

  it("presses the opted-in button after the field", () => {
    const { host, pressed } = row(
      `<input aria-label="Rule pattern" /><input aria-label="Description" /><button ${ENTER_SUBMITS}>Add rule</button>`,
    );
    enter(host.querySelector('[aria-label="Description"]')!);
    expect(pressed).toHaveBeenCalledWith("Add rule");
  });

  it("does nothing when the next button is a choice, not the form's action", () => {
    // Account override: the field is followed by Ask a human and Deny.
    const { host, pressed } = row(
      `<input aria-label="Account name" /><button>Ask a human</button><button ${ENTER_SUBMITS}>Set</button>`,
    );
    enter(host.querySelector("input")!);
    expect(pressed).not.toHaveBeenCalled();
  });

  it("leaves a held button alone, and a field still composing", () => {
    const { host, pressed } = row(
      `<input aria-label="Agent id" /><button ${ENTER_SUBMITS} disabled>Lock down</button>`,
    );
    enter(host.querySelector("input")!);
    host.querySelector("button")!.disabled = false;
    enter(host.querySelector("input")!, { isComposing: true });
    expect(pressed).not.toHaveBeenCalled();
  });

  it("does not send a multi-line field on Enter", () => {
    const { host, pressed } = row(
      `<textarea aria-label="Exceptions"></textarea><button ${ENTER_SUBMITS}>Allow folder</button>`,
    );
    enter(host.querySelector("textarea")!);
    expect(pressed).not.toHaveBeenCalled();
  });

  it("is wired to the forms the QA found without it", async () => {
    const page = await mount({ identity: ROOT, policy: policy(), knownAgentIds: ["main"] });
    const marked = [...page.querySelectorAll(`button[${ENTER_SUBMITS}]`)].map((button) =>
      button.textContent?.trim(),
    );
    for (const label of ["Add rule", "Lock down", "Set timeout", "Show permissions"]) {
      expect(marked).toContain(label);
    }
    // Each one is the first button after a field of its own row, so Enter reaches it.
    for (const button of page.querySelectorAll<HTMLButtonElement>(`button[${ENTER_SUBMITS}]`)) {
      const own = button.closest(".settings-row")!;
      const reaches = [...own.querySelectorAll("input")].some(
        (field) =>
          [...own.querySelectorAll("button")].find(
            (candidate) =>
              field.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING,
          ) === button,
      );
      expect(reaches, button.textContent?.trim()).toBe(true);
    }
  });

  it("reaches each opted-in button on a User's page too, where the forms differ", async () => {
    // QA of 2026-10-28: the check above renders Root's page. A User is shown the
    // rule-request and setting-request forms and its own variants of the others.
    const page = await mount({
      identity: {
        username: "lina",
        role: "user",
        assignedAgents: ["main"],
        canAuthorPolicy: true,
      },
      policy: policy(),
      knownAgentIds: ["main"],
    });
    const marked = [...page.querySelectorAll<HTMLButtonElement>(`button[${ENTER_SUBMITS}]`)];
    expect(marked.length).toBeGreaterThan(2);
    for (const button of marked) {
      const own = button.closest(".settings-row")!;
      const reaches = [...own.querySelectorAll("input")].some(
        (field) =>
          [...own.querySelectorAll("button")].find(
            (candidate) =>
              field.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING,
          ) === button,
      );
      expect(reaches, button.textContent?.trim()).toBe(true);
    }
  });
});

describe("finding 445: the section list takes focus to the section", () => {
  function sections() {
    const body = document.createElement("div");
    body.innerHTML = ["Identity", "Accounts", "Policy"]
      .map(
        (title) =>
          `<section class="settings-section"><h2 class="settings-section__heading">${title}</h2><button>in ${title}</button></section>`,
      )
      .join("");
    document.body.replaceChildren(body);
    const scrolled = vi.fn();
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: scrolled,
    });
    return { body, scrolled };
  }

  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it("moves focus to the chosen section's heading, so Tab continues there", () => {
    const { body } = sections();
    scrollToSection(body, 2);
    expect(document.activeElement?.textContent).toBe("Policy");
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
  });

  it("does not animate the scroll for a reader who asked for reduced motion", () => {
    const { body, scrolled } = sections();
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce") }));
    scrollToSection(body, 1);
    vi.unstubAllGlobals();
    expect(scrolled).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });
});

describe("finding 446: the chain verdict is read out when it arrives", () => {
  it("has a live region before the first verification, and the verdict in it after", () => {
    const before = ledger([entry({})]);
    const region = before.querySelector('[role="status"].governance-visually-hidden');
    expect(region).not.toBeNull();
    expect(region!.textContent?.trim()).toBe("");
    const after = ledger([entry({})], { ok: true, entriesChecked: 387 });
    const verdict = after.querySelector('[role="status"].governance-visually-hidden');
    expect(verdict?.textContent).toContain("(387)");
  });
});

describe("finding 447: a long ledger entry does not fill the screen", () => {
  it("cuts the bold title and gives the whole text one click below", () => {
    // Seen live: a scheduled job's prompt carries the scheduler's whole preamble, about a
    // thousand characters, and the title printed all of it as eight bold lines.
    const preamble = `prompt from scheduled job "T75 morning summary": ${"x".repeat(1000)}`;
    const host = ledger([entry({ resource: preamble })]);
    const title =
      [...host.querySelectorAll(".settings-row__title")]
        .map((candidate) => candidate.textContent ?? "")
        .find((text) => text.includes("#1")) ?? "";
    expect(title.length).toBeLessThan(300);
    expect(title).toContain("T75 morning summary");
    const whole = host.querySelector("details.governance-ledger-whole");
    expect(whole?.querySelector("summary")?.textContent).toContain(String(preamble.length));
    expect(whole?.textContent).toContain(preamble);
  });

  it("leaves an ordinary entry whole, with the hash at its end", () => {
    // A heartbeat prompt is recorded as 266 characters ending in the HMAC that identifies
    // it; nine in ten entries on the fixture were 385 characters or fewer.
    const heartbeat = `background prompt from the heartbeat; 375 characters, 3 lines; HMAC-SHA256 ${"ab".repeat(95)}`;
    const host = ledger([entry({ resource: heartbeat })]);
    expect(host.querySelector("details.governance-ledger-whole")).toBeNull();
    expect(host.textContent).toContain(heartbeat);
  });
});

describe("finding 448: placeholders end in an ellipsis, not three dots", () => {
  it("has no three-dot placeholder among the governance strings", () => {
    const strings: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === "string") {
        strings.push(value);
      } else if (value && typeof value === "object") {
        Object.values(value).forEach(walk);
      }
    };
    walk(enGovernance);
    expect(strings.filter((text) => text.includes("..."))).toEqual([]);
  });
});
