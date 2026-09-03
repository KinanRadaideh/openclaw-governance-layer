// Gives a text box a hover tooltip when its own text does not fit inside it.
//
// ## Why this exists
//
// The first fix for a clipped placeholder is to make the box wider, and
// `styles/governance.css` does exactly that where there is room. There is not
// always room: a settings row holds a label, a description, an input and two
// or three buttons on one line, and widening the input past a point pushes the
// last button off the edge, which is a worse failure than a clipped
// placeholder, because a control you cannot see is a control you cannot press.
//
// So this is the fallback, and it is deliberately the *general* one: any text
// box anywhere in the Control UI whose text is cut off gets a `title`, and the
// browser shows the whole string on hover before the operator clicks in.
//
// ## Why the width is measured with a canvas
//
// `scrollWidth > clientWidth` is the usual overflow test and it does not work
// here. For an `<input>` it reflects the **value**, and the string that is
// almost always the one being clipped is the **placeholder**. An empty input
// reports no overflow no matter how long its placeholder is. Measuring the
// text against the element's own computed font is the only test that covers
// both, so that is what this does.
//
// ## What it will not do
//
// It never overwrites a `title` somebody else set. Authored titles say
// something the text does not, and silently replacing one with a copy of the
// placeholder would lose it. Ownership is tracked with a data attribute rather
// than by comparing strings, so a title this module set and then no longer
// needs is removed, and one it did not set is left alone.

const OWNED = "data-overflow-title";

/** Text boxes this applies to. `type=hidden` and the button-like types are out. */
const SELECTOR = [
  "input:not([type='hidden']):not([type='checkbox']):not([type='radio'])",
  "input:not([type='button']):not([type='submit']):not([type='reset'])",
  "textarea",
].join(",");

let measuringContext: CanvasRenderingContext2D | null | undefined;

function context(): CanvasRenderingContext2D | null {
  if (measuringContext === undefined) {
    // A detached canvas: never appended, so it costs no layout and no paint.
    measuringContext = document.createElement("canvas").getContext("2d");
  }
  return measuringContext;
}

function measure(text: string, font: string): number | null {
  const ctx = context();
  if (!ctx || !font) {
    return null;
  }
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** The string a reader would want to see in full: what is typed, or the hint. */
function visibleText(el: HTMLInputElement | HTMLTextAreaElement): string {
  return el.value.trim() ? el.value : el.placeholder;
}

/**
 * Whether `el`'s text is wider than the space it has to render in.
 *
 * `clientWidth` is the padding box, so the padding comes off to leave the
 * content box. A one-pixel tolerance keeps sub-pixel font metrics from
 * flagging text that visibly fits.
 */
function isClipped(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  const text = visibleText(el);
  if (!text) {
    return false;
  }
  // A textarea wraps, so it is only ever clipped vertically, and that is what
  // scrollHeight answers correctly.
  if (el instanceof HTMLTextAreaElement) {
    return el.scrollHeight > el.clientHeight + 1;
  }
  const style = getComputedStyle(el);
  const available =
    el.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
  if (!Number.isFinite(available) || available <= 0) {
    // Not laid out yet (display:none, or a panel that has not opened). Say no
    // rather than guessing: a hidden field gets re-checked when it is shown.
    return false;
  }
  const width = measure(text, style.font);
  return width === null ? false : width > available + 1;
}

/** Adds, refreshes or removes the tooltip on one text box. */
export function applyOverflowTitle(el: HTMLInputElement | HTMLTextAreaElement): void {
  const owned = el.hasAttribute(OWNED);
  if (el.title && !owned) {
    return;
  }
  if (isClipped(el)) {
    const text = visibleText(el);
    if (el.title !== text) {
      el.title = text;
    }
    el.setAttribute(OWNED, "");
    return;
  }
  if (owned) {
    el.removeAttribute("title");
    el.removeAttribute(OWNED);
  }
}

function applyWithin(node: ParentNode): void {
  for (const el of node.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(SELECTOR)) {
    applyOverflowTitle(el);
  }
}

/**
 * Starts keeping every text box under `root` labelled, and returns a function
 * that stops it.
 *
 * Three triggers, because a box can start fitting or stop fitting for three
 * unrelated reasons: it was re-rendered (Lit replaces nodes), the operator
 * typed, or the column it sits in changed width.
 */
export function startInputOverflowTitles(root: ParentNode = document): () => void {
  applyWithin(root);

  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver((entries) => {
          for (const entry of entries) {
            const el = entry.target;
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
              applyOverflowTitle(el);
            }
          }
        });

  const observed = new WeakSet<Element>();
  const observeAll = (scope: ParentNode) => {
    if (!resizeObserver) {
      return;
    }
    for (const el of scope.querySelectorAll(SELECTOR)) {
      if (!observed.has(el)) {
        observed.add(el);
        resizeObserver.observe(el);
      }
    }
  };
  observeAll(root);

  const onInput = (event: Event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      applyOverflowTitle(target);
    }
  };
  // Capture, so it still fires for inputs inside components that stop the
  // event before it reaches the document.
  document.addEventListener("input", onInput, true);

  const mutationObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const added of record.addedNodes) {
        if (added instanceof Element) {
          if (added.matches(SELECTOR)) {
            applyOverflowTitle(added as HTMLInputElement);
          }
          applyWithin(added);
          observeAll(added);
        }
      }
      if (record.type === "attributes" && record.target instanceof Element) {
        const el = record.target;
        if (el.matches(SELECTOR)) {
          applyOverflowTitle(el as HTMLInputElement);
        }
      }
    }
  });
  mutationObserver.observe(root === document ? document.body : (root as Element), {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["placeholder", "value", "style", "class"],
  });

  return () => {
    document.removeEventListener("input", onInput, true);
    mutationObserver.disconnect();
    resizeObserver?.disconnect();
  };
}
