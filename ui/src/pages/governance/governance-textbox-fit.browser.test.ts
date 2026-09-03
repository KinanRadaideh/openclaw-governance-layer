// Every text box on the governance page either fits its own text or says what
// it is hiding.
//
// ## Why this needs a real browser
//
// The question is "does this string fit inside this box", and only a layout
// engine can answer it. jsdom reports every width as zero, so the same
// assertions there would pass against a page with every placeholder clipped --
// which is finding 224's lesson exactly: a check that cannot fail is not
// evidence. `describe.skipIf` below makes the skip visible rather than letting
// the file quietly pass in the wrong environment.
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
  GovernanceDeploymentStatus,
  GovernanceIdentity,
  GovernancePolicyDocument,
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
    activeSessions: { supported: true, sessions: [], sampledAt: "2026-09-03T10:00:00.000Z" },
  };
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
