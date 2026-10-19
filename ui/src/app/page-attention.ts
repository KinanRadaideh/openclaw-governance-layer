// A page's own count of things waiting for this person, for the shell's tab title.
//
// The shell owns `document.title` and rewrites it after every render, so a page that set
// the title itself would be overwritten by the next one. The Gateway's approval queue
// already feeds the "(N) …" prefix; this carries the questions it does not hold (the
// governance dashboard's, which since T86 D7 wait only there).
export const PAGE_ATTENTION_EVENT = "openclaw-page-attention";

/** Tells the shell how many things on `page` wait for an answer; 0 takes the count away. */
export function reportPageAttention(page: HTMLElement, count: number): void {
  page.dispatchEvent(
    new CustomEvent<number>(PAGE_ATTENTION_EVENT, { bubbles: true, composed: true, detail: count }),
  );
}
