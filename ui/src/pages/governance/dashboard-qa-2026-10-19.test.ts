/* @vitest-environment jsdom */

// The dashboard QA of 2026-10-19: usability, driven live from every tier.
//
// Each case here was seen on the running Gateway first (`mg/QA-SESSION-2026-10-19.md`)
// and is pinned as an operator meets it: the words on screen, where the reader is put,
// and what is sent. None of them was a wrong permission; every one was the page making
// a correct system harder to use than it needed to be.
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  GovernanceApi,
  GovernanceIdentity,
  GovernancePolicyDocument,
  GovernanceUserRecord,
} from "./api.ts";
import { afterPageUpdate } from "./page-focus.ts";
import {
  emptyAccountDrafts,
  renderUsersSection,
  setAccountPassword,
  type AccountDrafts,
} from "./panels/account-panels.ts";
import "./governance-page.ts";

type PageState = {
  identity: GovernanceIdentity | null;
  policy: GovernancePolicyDocument | null;
  users: unknown[];
  loading: boolean;
  updateComplete: Promise<unknown>;
  requestUpdate(): void;
} & HTMLElement;

const CONVERSATION_KEYS = [
  "conversationAgentId",
  "transcript",
  "promptPending",
  "promptRunId",
  "promptSent",
  "promptStream",
] as const;

function policy(): GovernancePolicyDocument {
  return {
    version: 4,
    mode: "enforce",
    ask: "on-miss",
    agentMode: {},
    agentAsk: {},
    userAsk: {},
    hitlTimeoutSeconds: 300,
    rules: [],
    lockedAgents: [],
  } as unknown as GovernancePolicyDocument;
}

async function mount(state: Record<string, unknown>): Promise<PageState> {
  const page = document.createElement("openclaw-governance-page") as PageState;
  document.body.replaceChildren(page);
  await page.updateComplete;
  const merged: Record<string, unknown> = { loading: false, users: [], ...state };
  const seed: Record<string, unknown> = {};
  for (const key of CONVERSATION_KEYS) {
    if (key in merged) {
      seed[key] = merged[key];
      delete merged[key];
    }
  }
  Object.assign(page, merged);
  if (Object.keys(seed).length > 0) {
    (page as unknown as { conversationStateForTests: unknown }).conversationStateForTests = seed;
  }
  page.requestUpdate();
  await page.updateComplete;
  await page.updateComplete;
  return page;
}

type Turn = { role: "user" | "agent"; body: string; at: number };

function conversation(turns: Turn[], extra: Record<string, unknown> = {}) {
  return {
    identity: { username: "lina", role: "user", assignedAgents: ["main"] },
    policy: policy(),
    conversationAgentId: "main",
    transcript: { supported: true, turns },
    ...extra,
  };
}

describe("a message reads exactly as it was written", () => {
  it("adds no blank line or indent in front of a turn", async () => {
    // Seen live: every message opened with an empty line and twenty spaces, because the
    // template's own line break sat inside a `white-space: pre-wrap` box.
    const page = await mount(
      conversation([
        { role: "user", body: "list the folder", at: 1 },
        { role: "agent", body: "two files", at: 2 },
      ]),
    );
    const bodies = [...page.querySelectorAll<HTMLElement>('[role="log"] [style*="pre-wrap"]')];
    expect(bodies.map((body) => body.textContent)).toEqual(["list the folder", "two files"]);
  });

  it("does the same for an empty reply and a failed one", async () => {
    // The fix written inside the template was undone by the formatter, which moves a
    // long expression onto lines of its own; these two were the long ones.
    const page = await mount(
      conversation([
        { role: "agent", body: "", at: 2 },
        { role: "agent", body: "", at: 3, error: "the run did not complete" } as Turn,
      ]),
    );
    const bodies = [...page.querySelectorAll<HTMLElement>('[role="log"] [style*="pre-wrap"]')];
    expect(bodies).toHaveLength(2);
    for (const body of bodies) {
      expect(body.textContent).toBe(body.textContent?.trim());
    }
  });

  it("does the same for the reply that is still arriving", async () => {
    const page = await mount(
      conversation([], {
        promptPending: true,
        promptRunId: "run-1",
        promptSent: "list the folder",
        promptStream: "two fi",
      }),
    );
    const bodies = [...page.querySelectorAll<HTMLElement>('[style*="pre-wrap"]')].map(
      (body) => body.textContent,
    );
    expect(bodies).toContain("two fi");
    expect(bodies).toContain("list the folder");
  });

  it("puts the cursor in the message box when a conversation opens", async () => {
    // Seen live: Talk is replaced by the conversation it opens, so focus fell to the
    // document instead of the box the operator pressed Talk in order to type into.
    const page = await mount(conversation([{ role: "agent", body: "done", at: 2 }]));
    expect(document.activeElement).toBe(
      page.querySelector('textarea[aria-label="Message to the agent"]'),
    );
  });

  it("is not drawn in the centred, muted style kept for empty states", async () => {
    // `.settings-empty` centres and greys its text; a conversation set in it read as
    // placeholder text, with nothing to tell the operator's turns from the agent's.
    const page = await mount(conversation([{ role: "agent", body: "done", at: 2 }]));
    const log = page.querySelector('[role="log"]');
    expect(log).not.toBeNull();
    expect(log!.closest(".settings-empty")).toBeNull();
  });
});

describe("the transcript is read from its newest message", () => {
  // jsdom has no layout, so the box's geometry is supplied and its scroll position kept.
  const scroll = new WeakMap<Element, number>();
  let height = 900;

  beforeEach(() => {
    height = 900;
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute("role") === "log" ? height : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.getAttribute("role") === "log" ? 300 : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTop", {
      configurable: true,
      get(this: HTMLElement) {
        return scroll.get(this) ?? 0;
      },
      set(this: HTMLElement, value: number) {
        scroll.set(this, value);
      },
    });
  });

  afterEach(() => {
    delete (HTMLElement.prototype as { scrollHeight?: number }).scrollHeight;
    delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
    delete (HTMLElement.prototype as { scrollTop?: number }).scrollTop;
  });

  const turns: Turn[] = [
    { role: "user", body: "first", at: 1 },
    { role: "agent", body: "first reply", at: 2 },
  ];

  it("opens at the bottom, where the latest exchange is", async () => {
    // Seen live: thirty turns, the box opened on one from eleven days earlier, and the
    // reply the operator was waiting for arrived below the fold.
    const page = await mount(conversation(turns));
    const log = page.querySelector<HTMLElement>('[role="log"]')!;
    expect(log.scrollTop).toBe(900);
  });

  it("follows a new reply while the reader is at the bottom", async () => {
    const page = await mount(conversation(turns));
    const log = page.querySelector<HTMLElement>('[role="log"]')!;
    height = 1200;
    (page as unknown as { conversationStateForTests: unknown }).conversationStateForTests = {
      transcript: { supported: true, turns: [...turns, { role: "agent", body: "more", at: 3 }] },
    };
    page.requestUpdate();
    await page.updateComplete;
    expect(log.scrollTop).toBe(1200);
  });

  it("leaves a reader who scrolled back to read history where they are", async () => {
    const page = await mount(conversation(turns));
    const log = page.querySelector<HTMLElement>('[role="log"]')!;
    log.scrollTop = 100;
    height = 1200;
    (page as unknown as { conversationStateForTests: unknown }).conversationStateForTests = {
      transcript: { supported: true, turns: [...turns, { role: "agent", body: "more", at: 3 }] },
    };
    page.requestUpdate();
    await page.updateComplete;
    expect(log.scrollTop).toBe(100);
  });
});

describe("the escalation setting is explained in the words its buttons use", () => {
  it("names Ask a human and Deny, not the retired Ask on miss and Off", async () => {
    const page = await mount({
      identity: { username: "ada", role: "administrator", assignedAgents: [] },
      policy: policy(),
    });
    const text = (page.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("Ask a human");
    expect(text).not.toContain("Ask on miss");
    expect(text).not.toContain("Off denies");
  });
});

describe("creating an account states the password rule before sending", () => {
  function mountForm(patch: Partial<AccountDrafts>) {
    const createUser = vi.fn(async () => ({}));
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    render(
      renderUsersSection({
        api: () => ({ createUser }) as unknown as GovernanceApi,
        run: async (action) => {
          await action();
        },
        confirmThen: async () => {},
        identity: { username: "root", role: "root", assignedAgents: [] },
        users: [] as GovernanceUserRecord[],
        administrators: [],
        busy: false,
        drafts: { ...emptyAccountDrafts(), newUserRole: "administrator", ...patch },
        onDraft: () => {},
        setPassword: async () => {},
        reloadUsers: async () => {},
      }),
      host,
    );
    const button = [...host.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === "Create account",
    );
    return { host, button, createUser };
  }

  it("holds Create account and says why while the password is too short", () => {
    // Seen live: the form sent a five-character password, and the refusal arrived as a
    // banner at the top of the page, 1,200 pixels above the form. The other two password
    // forms (the first Root, Set password) already checked first.
    const { host, button } = mountForm({ newUserName: "newbie", newUserPassword: "short" });
    expect(button?.disabled).toBe(true);
    expect((host.textContent ?? "").replace(/\s+/g, " ")).toContain(
      "Password must be at least 8 characters.",
    );
  });

  it("allows it once the password is long enough", () => {
    const { host, button } = mountForm({ newUserName: "newbie", newUserPassword: "long-enough" });
    expect(button?.disabled).toBe(false);
    expect(host.textContent ?? "").not.toContain("Password must be at least");
  });
});

describe("Set password stores the password that was typed", () => {
  function context(typed: string, setUserPassword = vi.fn(async () => ({ ok: true }))) {
    const onError = vi.fn();
    return {
      setUserPassword,
      onError,
      ctx: {
        api: () => ({ setUserPassword }) as unknown as GovernanceApi,
        run: async (action: () => Promise<unknown>) => {
          await action();
        },
        confirmThen: async (_options: unknown, action: () => Promise<unknown>) => {
          await action();
        },
        identity: { username: "root", role: "root", assignedAgents: [] } as GovernanceIdentity,
        drafts: { ...emptyAccountDrafts(), passwordEdits: { "user-3": typed } },
        onDraft: () => {},
        onError,
      },
    };
  }

  it("keeps spaces at either end, as sign-in and the server do", async () => {
    // The server stores a password exactly as sent and sign-in compares it exactly, so a
    // trimmed copy is a different password from the one the operator typed and handed on.
    const { setUserPassword, ctx } = context(" pass phrase ");
    await setAccountPassword("user-3", "user3", ctx);
    expect(setUserPassword).toHaveBeenCalledWith("user-3", " pass phrase ");
  });

  it("still sends nothing for a field of spaces", async () => {
    const { setUserPassword, onError, ctx } = context("    ");
    await setAccountPassword("user-3", "user3", ctx);
    expect(setUserPassword).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe("keyboard focus survives an action", () => {
  // Seen live after every press that goes through the page's `run`: the pressed button is
  // disabled while the request is out, the browser drops focus to the document, and a
  // keyboard user is sent back to "Skip to main content" at the top of the app.
  function setUp() {
    const host = document.createElement("div");
    host.innerHTML = `<div class="governance-page__body"><button id="act">Lock down</button></div>`;
    document.body.replaceChildren(host);
    const button = host.querySelector<HTMLButtonElement>("#act")!;
    afterPageUpdate(host, null, false);
    button.focus();
    return { host, button };
  }

  it("returns focus to the control that was pressed once the page is idle again", () => {
    const { host, button } = setUp();
    button.blur();
    button.disabled = true;
    afterPageUpdate(host, null, true);
    expect(document.activeElement).toBe(document.body);
    button.disabled = false;
    afterPageUpdate(host, null, false);
    expect(document.activeElement).toBe(button);
  });

  it("puts focus on the refusal when the action was refused", () => {
    const { host, button } = setUp();
    button.blur();
    button.disabled = true;
    afterPageUpdate(host, null, true);
    const banner = document.createElement("div");
    banner.setAttribute("role", "alert");
    banner.textContent = "password must be at least 8 characters";
    host.prepend(banner);
    button.disabled = false;
    afterPageUpdate(host, banner.textContent, false);
    expect(document.activeElement).toBe(banner);
  });

  it("falls back to the field typed in when the result leaves the button disabled", () => {
    // Lock down, Add rule and Create account clear their form on success, which leaves
    // the pressed button disabled until something is typed again.
    const { host, button } = setUp();
    const field = document.createElement("input");
    host.querySelector(".governance-page__body")!.prepend(field);
    field.focus();
    button.focus();
    button.blur();
    button.disabled = true;
    afterPageUpdate(host, null, true);
    afterPageUpdate(host, null, false);
    expect(document.activeElement).toBe(field);
  });

  it("waits for a confirmation dialog to close before putting focus back", async () => {
    // Seen live with Lock down: the action finished while focus was still in the closing
    // confirmation, and the dialog then handed focus to the pressed button, which the
    // cleared form had disabled, so it fell to the document after this module had looked.
    const { host, button } = setUp();
    const field = document.createElement("input");
    host.querySelector(".governance-page__body")!.prepend(field);
    field.focus();
    button.focus();
    const dialog = document.createElement("div");
    dialog.innerHTML = `<button id="confirm">Lock down</button>`;
    document.body.append(dialog);
    dialog.querySelector<HTMLButtonElement>("#confirm")!.focus();
    button.disabled = true;
    afterPageUpdate(host, null, true);
    afterPageUpdate(host, null, false);
    expect(document.activeElement?.id).toBe("confirm");
    dialog.querySelector<HTMLButtonElement>("#confirm")!.blur();
    dialog.remove();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 120);
    });
    expect(document.activeElement).toBe(field);
  });

  it("leaves focus alone when the operator has already moved it", () => {
    const { host, button } = setUp();
    const other = document.createElement("input");
    host.append(other);
    afterPageUpdate(host, null, true);
    other.focus();
    afterPageUpdate(host, null, false);
    expect(document.activeElement).toBe(other);
    expect(document.activeElement).not.toBe(button);
  });
});
