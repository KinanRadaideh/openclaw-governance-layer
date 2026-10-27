/* @vitest-environment node */

// The stylesheet half of the dashboard QA of 2026-10-27 (`mg/QA-SESSION-2026-10-27.md`).
//
// In the node environment because the check reads `governance.css` from disk, and under
// jsdom `import.meta.url` is not a `file:` URL (the reason `i18n-keys-resolve.test.ts`
// gives). jsdom computes no styles from a stylesheet anyway, so the rule is read as text.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(
  fileURLToPath(new URL("../../styles/governance.css", import.meta.url)),
  "utf8",
);

function block(selector: string): string | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(CSS)?.[1];
}

describe("finding 442: a notice is not drawn as an empty state", () => {
  it("styles the page's status notices as well as its alerts", () => {
    // The kill switch's "Locked down … confirmed stopped" is a status. Only alerts were
    // given the notice style, so it was drawn small, grey and centred above the page.
    const status = block('openclaw-governance-page .settings-empty[role="status"]');
    expect(status).toMatch(/color:\s*var\(--text\)/);
    expect(status).toMatch(/text-align:\s*start/);
    expect(status).toMatch(/border-left:/);
  });
});

describe("finding 446: the live region for the chain verdict is not drawn", () => {
  it("hides it visually and keeps it in the accessibility tree", () => {
    const hidden = block(".governance-visually-hidden");
    expect(hidden).toMatch(/position:\s*absolute/);
    expect(hidden).toMatch(/width:\s*1px/);
    expect(hidden).not.toMatch(/display:\s*none/);
  });
});
