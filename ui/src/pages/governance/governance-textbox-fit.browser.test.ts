// Every text box on the governance page either fits its own text or says what
// it is hiding.
//
// ## Why this needs a real browser
//
// The question is "does this string fit inside this box", and only a layout
// engine can answer it. jsdom reports every width as zero, so the same
// assertions there would pass against a page with every placeholder clipped --
// which is finding 224's lesson exactly: a check that cannot fail is not
// evidence.
//
// ## ⚠ HOW TO ACTUALLY RUN THIS, AND WHY THAT SENTENCE IS HERE
//
// **This file skipped every time it was run for the first three weeks of its
// life, and nothing said so.** The claim that stood here -- "`describe.skipIf`
// below makes the skip visible" -- was false in the only place it mattered.
// `skipIf` marks the tests skipped; the *default reporter* then prints one
// summary line reading "2 skipped", which nobody reads as "the only test in
// this project that can see layout did not run". You see it only under
// `--reporter=verbose`.
//
// Two things have to be true for it to execute, and neither was:
//
//  1. **The ui package's browser project.** The documented verification command
//     in `mg/HANDOFF.md` §4 runs `ui/src/pages/governance/` through the *root*
//     vitest config, which is jsdom. This file is skipped there by design and
//     always will be. It runs only under:
//
//         cd ui && node ../node_modules/vitest/vitest.mjs run \
//           --config vitest.config.ts --project browser
//
//  2. **Playwright's Chromium, downloaded.** `npx playwright install chromium`.
//     Without it the project fails to launch rather than skipping, which is at
//     least loud. Pointing `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` at an ordinary
//     installed Chrome does *not* work: it attaches to the existing user
//     profile and hangs without ever handing Playwright a page.
//
// That gap is why finding 240's fix shipped incomplete. It was written with a
// test in this file, the test could not run, and the operator found the same
// class of defect again the next day. Fifth instance of this project's central
// pattern, after T25, T19, T29 and findings 136 and 137: **a check that looks
// like coverage and never executes.**
//
// ## The rule being pinned
//
// Widen the box where there is room; where there is not, hand the reader the
// text on hover. Both halves are needed and neither is sufficient: a settings
// row holds a label, a description, an input and two or three buttons on one
// line, so an input wide enough for "Optional, OpenClaw chooses one" would push
// the last button off the edge -- and a control you cannot see is worse than a
// placeholder you cannot read.
//
// So the assertion is a disjunction, deliberately: **fits, or is labelled.**
// Asserting "always fits" would fail honestly on the crowded rows, and
// asserting "always labelled" would let the layout rot as long as tooltips
// appeared.
import { beforeEach, describe, expect, it } from "vitest";
import type {
  GovernanceActiveSessionsView,
  GovernanceAgentEntry,
  GovernanceDeploymentStatus,
  GovernanceIdentity,
  GovernancePolicyDocument,
  GovernanceTranscript,
  GovernanceUserRecord,
} from "./api.ts";
import "./governance-page.ts";
import "../../styles.css";
import "../../styles/governance.css";

const hasBrowserLayout = !navigator.userAgent.toLowerCase().includes("jsdom");

type PageState = {
  identity: GovernanceIdentity | null;
  loading: boolean;
  policy: GovernancePolicyDocument | null;
  users: GovernanceUserRecord[];
  activeSessions: GovernanceActiveSessionsView | null;
  deployment: GovernanceDeploymentStatus | null;
  agents: GovernanceAgentEntry[];
  conversationStateForTests: {
    conversationAgentId?: string;
    transcript?: GovernanceTranscript | null;
  };
  updateComplete: Promise<unknown>;
  requestUpdate(): void;
} & HTMLElement;

let page: PageState;

async function mount(state: Partial<PageState>): Promise<PageState> {
  const { page: browserPage } = await import("vitest/browser");
  await browserPage.viewport(1280, 900);
  page = document.createElement("openclaw-governance-page") as PageState;
  // A width, because the custom element is a light-DOM host with no intrinsic
  // one: without this every control measures against a zero-width box and the
  // overflow check below reports the whole page as escaped.
  page.style.display = "block";
  page.style.width = "1100px";
  document.body.append(page);
  await page.updateComplete;
  Object.assign(page, { loading: false, users: [], ...state });
  page.requestUpdate();
  await page.updateComplete;
  await page.updateComplete;
  // One frame, so the ResizeObserver that labels clipped inputs has run.
  await new Promise((resolve) => {
    requestAnimationFrame(() => resolve(null));
  });
  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
  return page;
}

/**
 * A shipped policy, so the Policy section actually renders.
 *
 * **This fixture had no `policy` at all until 2026-09-04, and that is a bigger
 * gap than it looks.** `renderPolicySection` returns early without one, so the
 * largest section on the page — the rule list, its filter, the authoring form,
 * the folder-grant panel and the Codex panel — was never on the page these
 * layout assertions measured. Every finding this file exists to catch could
 * have been sitting in it. The disclosure test below found this by asserting
 * that it had something to open, which is the same guard the first test in this
 * file uses and the reason both are written that way.
 *
 * One rule of each kind that matters: a self-protecting core denial (no switch,
 * a stated reason), a switchable core denial (a Switch off button), and an
 * operator rule with no description so the pattern becomes its title.
 */
function policyFixture(): GovernancePolicyDocument {
  const base = {
    resourceKind: "command" as const,
    createdAt: "2026-09-03T10:00:00.000Z",
    effect: "deny" as const,
    tier: "core" as const,
  };
  return {
    version: 1,
    mode: "enforce",
    ask: "off",
    agentAsk: { scout: "on-miss" },
    userAsk: {},
    agentMode: { scout: "monitor" },
    rules: [
      {
        ...base,
        id: "core-command-the-governance-command-line-which-can-switch-the",
        pattern: "(?:^|[^A-Za-z0-9_.-])governance\\s+(?:policy|agent|kill|ledger)\\b",
        description: "The governance command line, which can switch the gate off",
      },
      {
        ...base,
        id: "core-command-privilege-escalation-sudo-su-doas-runas-pkexec",
        pattern: "(?:^|[^A-Za-z0-9_.-])(?:sudo|su|doas|runas|pkexec)\\b",
        description: "Privilege escalation (sudo, su, doas, runas, pkexec)",
      },
      {
        ...base,
        id: "admin-path-project-directory",
        resourceKind: "path",
        effect: "allow",
        tier: undefined,
        pattern: "^(?:[A-Za-z]:)?[\\\\/]Users[\\\\/][^\\\\/]+[\\\\/]projects[\\\\/].*$",
        description: undefined,
        agentId: "scout",
      },
    ],
  } as unknown as GovernancePolicyDocument;
}

function rootState(): Partial<PageState> {
  return {
    identity: { username: "kinan", role: "root", assignedAgents: [] },
    users: [
      {
        id: "id-kinan",
        username: "kinan",
        role: "root",
        createdAt: "2026-09-03T10:00:00.000Z",
        assignedAgents: [],
      },
      {
        id: "id-malek",
        username: "malek",
        role: "administrator",
        createdAt: "2026-09-03T10:00:00.000Z",
        assignedAgents: [],
      },
    ],
    policy: policyFixture(),
    // Root-only, and the panel returns `nothing` without it, which is what
    // keeps the "Why this is off by default" disclosure off the page.
    codexBackend: { enabled: false, explicit: false, agentIds: [] },
    activeSessions: { supported: true, sessions: [], sampledAt: "2026-09-03T10:00:00.000Z" },
    // ------------------------------------------------------------------
    // **The agent registry and an open conversation** (2026-09-08).
    //
    // Without these three fields the "Your agents" section rendered a hint and
    // a disabled button and nothing else: no agent picker, because the picker
    // is behind `agents.length > 0`, and **no transcript and no composer**,
    // because those are behind `conversationAgentId`. So the one panel the
    // User tier exists for -- the message box an operator types a task into --
    // had never been measured by the only test in this project that can
    // measure anything.
    //
    // That is **finding 251 exactly, one panel over**: 251 was this fixture
    // having no `policy`, which left the largest section of the page
    // unmeasured, and the two authoring fields it then exposed defeated both
    // halves of finding 240's fix. This one hid a box that was **155px wide at
    // every window size** -- an `<input>`'s default intrinsic width -- inside a
    // block that sized itself to its own content instead of to the cell it was
    // given.
    //
    // A fixture is part of the check. Anything this one omits is not covered,
    // however green the file reads.
    // ------------------------------------------------------------------
    agents: [
      { agentId: "scout", displayName: "Scout Bot", registered: true },
      { agentId: "probe1", displayName: "Probe One", registered: true },
    ],
    // Through the page's documented test seam, because T53 moved these onto
    // `ConversationController` and a plain assignment would land on a property
    // nothing reads -- which would leave the panel unrendered again, silently,
    // exactly as before.
    conversationStateForTests: {
      conversationAgentId: "scout",
      transcript: {
        agentId: "scout",
        supported: true,
        // **Short on purpose.** The first draft of this fixture carried two
        // sentence-long turns, and they padded the panel out to 802px of an
        // 834px row all by themselves -- so the width assertion below passed
        // with every candidate fix removed. The defect is that the panel sizes
        // to its content, so a fixture whose content is already wide cannot
        // see it. A new conversation is also the state an operator meets
        // first, and it is where the 155px box was measured.
        turns: [
          {
            id: "turn-1",
            runId: "run-1",
            role: "user",
            at: "2026-09-03T10:00:00.000Z",
            body: "hi",
          },
        ],
      },
    },
  } as Partial<PageState>;
}

/** The text a reader would want in full: what is typed, or the hint. */
function visibleText(el: HTMLInputElement | HTMLTextAreaElement): string {
  return el.value.trim() ? el.value : el.placeholder;
}

/** Measures the text against the element's own font, as the page code does. */
function textWidth(el: HTMLElement, text: string): number {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) {
    return 0;
  }
  context.font = getComputedStyle(el).font;
  return context.measureText(text).width;
}

function contentWidth(el: HTMLElement): number {
  const style = getComputedStyle(el);
  return (
    el.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)
  );
}

function textBoxes(): HTMLInputElement[] {
  return [...page.querySelectorAll<HTMLInputElement>("input")].filter(
    (el) => !["hidden", "checkbox", "radio", "button", "submit", "reset"].includes(el.type),
  );
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe.skipIf(!hasBrowserLayout)("governance text boxes", () => {
  it("finds text boxes to check, so a passing run means something", async () => {
    await mount(rootState());

    // The guard against this whole file passing because the selector matched
    // nothing -- which is how a green suite says nothing at all.
    expect(textBoxes().length).toBeGreaterThan(3);
  });

  it("has the conversation composer on the page it measures", async () => {
    // **A fixture guard, and the second one this file has needed.** Finding 251
    // was `rootState()` carrying no policy, which left the largest section of
    // the page unmeasured while every test here passed. The same omission then
    // hid the message box an operator types a task into: the composer is
    // behind `conversationAgentId` and the agent picker behind
    // `agents.length > 0`, and the fixture set neither, so the panel the User
    // tier exists for had never been in front of a layout engine. It was
    // **155px wide at every window size** when somebody finally looked.
    //
    // Asserted by name rather than by counting boxes, so dropping the
    // conversation from the fixture fails here instead of quietly lowering the
    // number above.
    await mount(rootState());

    const composer = textBoxes().find(
      (el) => el.getAttribute("aria-label") === "Message to the agent",
    );
    expect(composer, "the fixture must open a conversation").toBeTruthy();
    // **And no width assertion here, deliberately.**
    //
    // The defect this fixture was widened for is that the conversation panel
    // sized itself to its own content rather than to the row it was given: on
    // the running gateway, at a 1280px viewport, the block measured **424px in
    // a 554px cell** and the message box inside it **155px**, unchanged at a
    // 1900px viewport. The repair was measured the same way: 554px and 380px.
    //
    // It could not be made to fail here. In this fixture the panel measures
    // 802px of an 834px row **with the fix and without it** -- the mounted
    // component is a bare 1100px block, and the live page's row geometry comes
    // from the settings pane around it, which this harness does not build.
    // Three drafts of an assertion passed against every candidate revert
    // (a pixel floor, the block against its own wrapper, the block against the
    // row), and a fourth would have been a fourth guess.
    //
    // So this test pins the thing it *can* pin: that the composer is on the
    // page this file measures at all. That is the omission that hid the defect
    // for the life of the panel, and it is finding 251's exact shape. A check
    // that cannot fail is worse than no check (finding 224), so the width claim
    // stays where it was actually measured -- in the session record -- rather
    // than dressed up as coverage here.
  });

  it("either fits each box's own text or labels it for hover", async () => {
    await mount(rootState());

    const unlabelled = textBoxes()
      .filter((el) => el.offsetParent !== null)
      .map((el) => {
        const text = visibleText(el);
        if (!text) {
          return null;
        }
        const fits = textWidth(el, text) <= contentWidth(el) + 1;
        const labelled = (el.title ?? "").includes(text);
        return fits || labelled ? null : `${el.getAttribute("aria-label") ?? el.name}: "${text}"`;
      })
      .filter((entry): entry is string => entry !== null);

    expect(unlabelled).toEqual([]);
  });

  it("labels a box whose placeholder is far too long for it", async () => {
    await mount(rootState());
    const box = textBoxes().find((el) => el.offsetParent !== null);
    expect(box).toBeDefined();

    // Forced rather than found: this asserts the fallback fires, so it has to
    // create the condition instead of hoping some row happens to be crowded.
    box!.placeholder = "A placeholder far longer than any of these boxes could ever hope to show";
    box!.style.width = "60px";
    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });

    expect(box!.title).toContain("far longer than any of these boxes");
  });

  it("drops the label again once the text fits", async () => {
    await mount(rootState());
    const box = textBoxes().find((el) => el.offsetParent !== null);
    box!.placeholder = "A placeholder far longer than any of these boxes could ever hope to show";
    box!.style.width = "60px";
    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });
    expect(box!.title).not.toBe("");

    box!.placeholder = "ok";
    box!.style.width = "300px";
    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });

    // A stale tooltip is its own defect: it describes a box that has changed.
    expect(box!.title).toBe("");
  });

  it("never lets a control sit outside the page's own width", async () => {
    await mount(rootState());

    // The clipped "Create account" button: the row disabled wrapping, so the
    // last control in a crowded cluster was rendered past the visible edge.
    // Measured against the viewport, because "off the screen" is what an
    // operator sees and what the report was about.
    const pageRight = document.documentElement.clientWidth;
    const escaped = [...page.querySelectorAll<HTMLElement>("button, input, select")]
      .filter((el) => el.offsetParent !== null)
      .filter((el) => el.getBoundingClientRect().right > pageRight + 1)
      .map((el) => el.textContent?.trim() || el.getAttribute("aria-label") || el.tagName);

    expect(escaped).toEqual([]);
  });

  // **Why this exists beside the test above, which measures the same thing
  // against a different edge.**
  //
  // The viewport check passed for months while "Set password", the
  // create-account fields, the rule-request form and both disclosures were all
  // visibly cut off, because the harness gives the page 1100px inside a
  // viewport wider still. The card is narrower than either. Nothing was off the
  // *screen*; everything was off the *card*, and `.settings-group` sets
  // `overflow: hidden`, so what an operator saw was a control that stopped
  // mid-word at a rounded border.
  //
  // The clipping edge is the one to assert against. This is the same shape as
  // finding 224 — a check standing in for something it does not exercise — and
  // the honest version measures where the clip actually happens.
  it("never lets a control sit outside the card that clips it", async () => {
    await mount(rootState());

    const escaped = [...page.querySelectorAll<HTMLElement>(".settings-group")].flatMap((group) => {
      const bounds = group.getBoundingClientRect();
      return [...group.querySelectorAll<HTMLElement>("button, input, select, textarea, details")]
        .filter((el) => el.offsetParent !== null)
        .filter((el) => {
          const box = el.getBoundingClientRect();
          return box.width > 0 && (box.right > bounds.right + 1 || box.left < bounds.left - 1);
        })
        .map((el) => el.textContent?.trim() || el.getAttribute("aria-label") || el.tagName);
    });

    expect(escaped).toEqual([]);
  });

  // The disclosures are the two longest pieces of prose on the page and both
  // were unstyled, so each was laid out as one very long line inside a
  // shrink-to-fit cluster. Opening them is the condition; a closed `<details>`
  // is a single summary line and proves nothing about the content.
  it("keeps an opened disclosure inside its card", async () => {
    await mount(rootState());

    const disclosures = [...page.querySelectorAll<HTMLDetailsElement>("details")];
    expect(disclosures.length).toBeGreaterThan(0);
    for (const disclosure of disclosures) {
      disclosure.open = true;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 60);
    });

    const escaped = disclosures
      .filter((el) => el.offsetParent !== null)
      .filter((el) => {
        const group = el.closest(".settings-group");
        if (!group) {
          return false;
        }
        const bounds = group.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        return box.right > bounds.right + 1 || box.left < bounds.left - 1;
      })
      .map((el) => el.querySelector("summary")?.textContent?.trim() ?? "(no summary)");

    expect(escaped).toEqual([]);
  });

  // Thirteen sections rendered with no space between them, because
  // `settings.css` spaces them with a child selector and this page nests them
  // two levels down. It read as one continuous block, and no test could see it:
  // the sections were all present, correctly ordered, and touching.
  it("separates the sections from one another", async () => {
    await mount(rootState());

    const sections = [
      ...page.querySelectorAll<HTMLElement>(".governance-page__body > .settings-section"),
    ];
    expect(sections.length).toBeGreaterThan(3);

    const touching = sections
      .slice(1)
      .map((section, index) => ({
        heading: section.querySelector(".settings-section__heading")?.textContent?.trim() ?? "?",
        gap: section.getBoundingClientRect().top - sections[index]!.getBoundingClientRect().bottom,
      }))
      .filter((entry) => entry.gap < 16)
      .map((entry) => `${entry.heading}: ${Math.round(entry.gap)}px`);

    expect(touching).toEqual([]);
  });
});

describe.skipIf(!hasBrowserLayout)("the section jump-nav", () => {
  it("renders one link per section and scrolls to the one clicked", async () => {
    await mount(rootState());

    const links = [...page.querySelectorAll<HTMLButtonElement>(".governance-nav__link")];
    const sections = [
      ...page.querySelectorAll<HTMLElement>(".governance-page__body .settings-section"),
    ];
    expect(links.length).toBe(sections.length);
    expect(links.length).toBeGreaterThan(1);

    const target = sections.at(-1);
    const before = target!.getBoundingClientRect().top;
    links.at(-1)!.click();
    await new Promise((resolve) => {
      setTimeout(resolve, 400);
    });

    // Something moved, and the last section moved upward: the assertion is
    // about the jump happening rather than about an exact scroll offset, which
    // depends on the viewport the runner happens to use.
    expect(target!.getBoundingClientRect().top).toBeLessThanOrEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Interaction, not layout.
//
// Everything above measures a page at rest. These press things, because the
// defects of 2026-09-04 were not all about size: the destructive controls were
// styled as ordinary ones (248), the ledger's active filter was indicated to a
// screen reader and to nobody else, and a rule with no Switch off said nothing
// about why. A computed colour and a click are the only ways to check any of
// that, and jsdom can do neither.
// ---------------------------------------------------------------------------

// **`skipIf`, like the two blocks above, and leaving it off was a real mistake.**
// These ran in the root jsdom config, where `mount` cannot work, and turned the
// documented verification command red — the first time this file has failed
// there rather than skipping. Loud is better than silent, but the six commands
// have to stay green, and a browser-only assertion belongs behind the same
// guard as every other one in this file.
describe.skipIf(!hasBrowserLayout)("the page as an operator uses it", () => {
  it("makes a destructive control look different from an ordinary one (248)", async () => {
    await mount(rootState());

    const plain = [...page.querySelectorAll<HTMLButtonElement>("button.btn")].find(
      (button) =>
        button.offsetParent !== null &&
        !button.classList.contains("danger") &&
        !button.classList.contains("primary"),
    );
    const danger = [...page.querySelectorAll<HTMLButtonElement>("button.btn.danger")].find(
      (button) => button.offsetParent !== null,
    );
    expect(plain, "no ordinary button on the page").toBeDefined();
    expect(danger, "no destructive button on the page").toBeDefined();

    // The defect was that these computed byte-identical: "Delete organisation"
    // rendered exactly like "Who does this affect?". Asserting they *differ*
    // rather than asserting a specific colour keeps this true through a theme
    // change, which is the thing worth pinning.
    const plainColour = getComputedStyle(plain!).color;
    const dangerColour = getComputedStyle(danger!).color;
    expect(dangerColour).not.toBe(plainColour);
  });

  it("uses no class the stylesheets have never heard of (248)", async () => {
    await mount(rootState());

    // **The assertion that actually pins 248, and the first one written did
    // not.** Comparing one danger button against one plain button proves that
    // *a* destructive control is styled; the defect was that **twenty** call
    // sites used four spellings of classes no stylesheet defines, so reverting
    // any single file left the others to satisfy that check. Mutation testing
    // found this: putting `btn--danger` back in `account-panels.ts` did not
    // turn the test red.
    //
    // The design system defines `.btn.primary` and `.btn.danger`. These four
    // are the spellings that were in use and that nothing anywhere defines.
    const NEVER_DEFINED = ["btn--primary", "btn--danger", "btn-primary", "btn-danger"];
    const offenders = [...page.querySelectorAll<HTMLElement>("*")]
      .filter((el) => NEVER_DEFINED.some((name) => el.classList.contains(name)))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${el.className}: ${el.textContent?.trim().slice(0, 30)}`,
      );

    expect(offenders).toEqual([]);
  });

  it("marks a primary action as primary", async () => {
    await mount(rootState());

    const primary = [...page.querySelectorAll<HTMLButtonElement>("button.btn.primary")].find(
      (button) => button.offsetParent !== null,
    );
    expect(primary, "no primary button on the page").toBeDefined();

    const plain = [...page.querySelectorAll<HTMLButtonElement>("button.btn")].find(
      (button) =>
        button.offsetParent !== null &&
        !button.classList.contains("danger") &&
        !button.classList.contains("primary"),
    );
    expect(getComputedStyle(primary!).backgroundColor).not.toBe(
      getComputedStyle(plain!).backgroundColor,
    );
  });

  it("shows which audit-ledger filter is active, to the eye and not only to a reader", async () => {
    await mount(rootState());

    const filters = [...page.querySelectorAll<HTMLButtonElement>("button")].filter((button) =>
      ["All", "Agent actions", "Policy changes", "Sign-ins"].includes(
        button.textContent?.trim() ?? "",
      ),
    );
    expect(filters.length).toBeGreaterThan(2);

    const active = filters.find((button) => button.getAttribute("aria-pressed") === "true");
    const inactive = filters.find((button) => button.getAttribute("aria-pressed") !== "true");
    expect(active, "no filter is marked active").toBeDefined();
    expect(inactive).toBeDefined();

    // `aria-pressed` was set correctly all along; the class naming the styled
    // state was misspelled, so a screen reader knew which filter was on and a
    // sighted operator did not.
    expect(getComputedStyle(active!).backgroundColor).not.toBe(
      getComputedStyle(inactive!).backgroundColor,
    );
  });

  it("says why a self-protecting core rule has no Switch off (247)", async () => {
    await mount(rootState());

    const text = page.textContent ?? "";
    // The row states the fact; a row above the list explains the tier once.
    expect(text).toContain("Cannot be switched off");
    expect(text).toContain("Why some built-in rules have no Switch off");

    // And the rule that *can* be switched off still offers the control, or the
    // explanation above would be describing something that is not there.
    const switchOff = [...page.querySelectorAll<HTMLButtonElement>("button")].filter((button) =>
      button.textContent?.includes("Switch off"),
    );
    expect(switchOff.length).toBeGreaterThan(0);
  });

  it("narrows the rule list when a filter is typed, and says so", async () => {
    await mount(rootState());

    const search = [...page.querySelectorAll<HTMLInputElement>("input[type='search']")].find(
      (input) => input.offsetParent !== null,
    );
    expect(search, "no rule filter on the page").toBeDefined();

    search!.value = "a-term-no-rule-contains-anywhere";
    search!.dispatchEvent(new Event("input", { bubbles: true }));
    await page.updateComplete;
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    // "No rules exist" and "your filter matches none of them" are different
    // facts, and showing the first when the second is true tells an operator
    // their policy is empty when it is not.
    const text = page.textContent ?? "";
    expect(text.toLowerCase()).toContain("no rules match");
  });
});
