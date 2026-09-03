// The governance page's own section list: fourteen sections on one very long
// page, and no way to see what was on it without scrolling the whole thing.
//
// **This is not the settings sidebar.** That one moves between pages
// (Governance, Approvals, Models, ...) and belongs to the app shell. This one
// moves *within* Governance and belongs to the page, which is why it renders
// here and scrolls independently of both the page and the shell.
//
// ## Why it reads the rendered page instead of a hand-written list
//
// The obvious build is an array of `{ id, label }` kept beside the render
// order. It rots the moment the two disagree, and they disagree constantly
// here: half of these sections are conditional on the operator's tier, so a
// hand-written list would offer a Viewer a link to Accounts, which is not on
// their page. A nav entry that jumps to nothing reads as a permission the
// account does not have.
//
// Reading the DOM makes that class of defect unrepresentable. The nav lists
// exactly the sections that rendered, labelled with exactly the heading text
// the operator can see, in exactly the order they appear.
import { html, nothing, type ReactiveControllerHost, type TemplateResult } from "lit";

export type GovernanceSection = { index: number; label: string };

const SECTION_SELECTOR = ".settings-section";
const HEADING_SELECTOR = ".settings-section__heading";

/**
 * The sections currently on the page, in document order.
 *
 * A section with no heading is skipped rather than given a placeholder label:
 * it is a bare group, and there is nothing for a reader to scan for.
 */
export function collectSections(body: ParentNode | null): GovernanceSection[] {
  if (!body) {
    return [];
  }
  const sections: GovernanceSection[] = [];
  const elements = body.querySelectorAll(SECTION_SELECTOR);
  elements.forEach((element, index) => {
    const label = element.querySelector(HEADING_SELECTOR)?.textContent?.trim();
    if (label) {
      sections.push({ index, label });
    }
  });
  return sections;
}

/** True when two collected lists differ, so the nav re-renders only on change. */
export function sectionsDiffer(
  left: readonly GovernanceSection[],
  right: readonly GovernanceSection[],
): boolean {
  if (left.length !== right.length) {
    return true;
  }
  return left.some(
    (section, at) => section.index !== right[at]?.index || section.label !== right[at]?.label,
  );
}

/** Scrolls the nth section into view. */
export function scrollToSection(body: ParentNode | null, index: number): void {
  const target = body?.querySelectorAll(SECTION_SELECTOR)[index];
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function renderSectionNav(props: {
  sections: readonly GovernanceSection[];
  activeIndex: number | null;
  label: string;
  onJump: (index: number) => void;
}): TemplateResult | typeof nothing {
  // One section is not a table of contents.
  if (props.sections.length < 2) {
    return nothing;
  }
  return html`
    <nav class="governance-nav" aria-label=${props.label}>
      <p class="governance-nav__heading">${props.label}</p>
      <ul class="governance-nav__list">
        ${props.sections.map(
          (section) => html`
            <li>
              <button
                type="button"
                class="governance-nav__link"
                title=${section.label}
                aria-current=${props.activeIndex === section.index ? "true" : "false"}
                @click=${() => props.onJump(section.index)}
              >
                ${section.label}
              </button>
            </li>
          `,
        )}
      </ul>
    </nav>
  `;
}

/**
 * Keeps a host's jump-nav in step with the page it actually rendered.
 *
 * A Lit reactive controller rather than three fields and two lifecycle hooks on
 * `governance-page.ts`, and for the reason `AgentRegistryController` gives:
 * adding this to the page took it past the 700-line limit the lint gate
 * enforces, and T16's answer to that limit is to move a subject out whole.
 *
 * The controller owns the observer and the derived state; the page owns the
 * data the server sent. That is the same boundary, one layer up.
 */
export class SectionNavController {
  /** Sections currently on the page, in document order. */
  sections: GovernanceSection[] = [];
  /** The one the reader is looking at, or null before the first scroll. */
  activeIndex: number | null = null;
  private spy?: IntersectionObserver;

  constructor(
    private readonly host: ReactiveControllerHost & { querySelector: ParentNode["querySelector"] },
  ) {
    host.addController(this);
  }

  hostConnected(): void {}

  hostDisconnected(): void {
    this.spy?.disconnect();
    this.spy = undefined;
  }

  /**
   * Call from `updated()`. Re-reads the rendered page, and re-arms the spy.
   *
   * `sectionsDiffer` guards the assignment, so asking the host to update here
   * cannot loop.
   */
  refresh(): void {
    const body = this.host.querySelector(".governance-page__body");
    const found = collectSections(body);
    if (sectionsDiffer(found, this.sections)) {
      this.sections = found;
      this.host.requestUpdate();
    }
    this.observe(body);
  }

  /** Scrolls to the nth section of the page this controller is watching. */
  jump(index: number): void {
    scrollToSection(this.host.querySelector(".governance-page__body"), index);
  }

  private observe(body: Element | null): void {
    this.spy?.disconnect();
    if (!body || typeof IntersectionObserver === "undefined") {
      return;
    }
    const sections = [...body.querySelectorAll(".settings-section")];
    this.spy = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => sections.indexOf(entry.target))
          .filter((index) => index >= 0)
          .toSorted((left, right) => left - right);
        const next = visible[0] ?? null;
        if (visible.length > 0 && next !== this.activeIndex) {
          this.activeIndex = next;
          this.host.requestUpdate();
        }
      },
      // A band across the upper part of the viewport: the section a reader
      // considers "current" is the one under the top edge, not the one
      // occupying the most pixels.
      { rootMargin: "-8% 0px -70% 0px", threshold: 0 },
    );
    for (const section of sections) {
      this.spy.observe(section);
    }
  }
}
