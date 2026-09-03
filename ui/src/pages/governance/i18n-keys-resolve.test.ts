/* @vitest-environment node */

// Every i18n key the governance dashboard asks for must exist.
//
// **This is the check that was missing, and finding 179 is what it costs.**
// `oversight-panels.ts` looked its strings up as `governance.deployment.*`
// while they had been written into `quickSettings.deployment.*`, so the
// Root-only deployment report rendered as `GOVERNANCE.DEPLOYMENT.TITLE` above a
// column of `governance.deployment.status.pass`. Nothing caught it: a typecheck
// cannot, because `t()` takes a string; a component test cannot, because a key
// resolving to itself is a perfectly good string and every assertion about
// *which rows appear* still passes; and `lint:ui:i18n` cannot, because it hunts
// for the **opposite** mistake. A string that should have been a key.
//
// Running this check for the first time on 2026-09-01 found **two more of the
// same class** that the T38 pass had walked straight past, both in the panel an
// operator opens to ask why an agent is blocked:
//
//   - `governance.kill.engaged`, the status beside "Emergency stop"
//   - `governance.rules.expires`, the word before a rule's expiry date
//
// The first rendered as the literal `governance.kill.engaged`. Neither was in
// the catalogue at all; `governance.rules` did not exist as a block.
//
// ## Why it reads the source rather than the rendered page
//
// A rendering test finds a missing key only on a panel it happens to render, in
// a state it happens to reach. The deployment panel needs a Root identity and
// a loaded report, and the two found here need a locked-down agent and a rule
// with an expiry. Reading every `t("…")` out of the source covers the keys no
// fixture reaches, which is where they hide.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { en } from "../../i18n/locales/en.ts";

/**
 * Every `.ts` file under this directory, read from disk.
 *
 * Deliberately `node:fs` rather than Vite's `import.meta.glob`, which would be
 * the shorter spelling and does not typecheck: `import.meta.glob` needs Vite's
 * client types, the test programs (`tsgo:core:test`) do not load them, and this
 * would be the only file in the repository to need them. A test that fails a
 * verification command in order to be concise is not concise.
 */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      sourceFiles(full, found);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      found.push(full);
    }
  }
  return found;
}

/**
 * This directory.
 *
 * The file runs in the **node** environment rather than jsdom, the header at
 * the top of the file, because under jsdom `import.meta.url` is not a `file:`
 * URL and `fileURLToPath` refuses it. Nothing here touches the DOM, so node is
 * the honest environment for it anyway.
 */
const HERE = fileURLToPath(new URL(".", import.meta.url));

/** `t("a.b.c")`. The ordinary form. */
const LITERAL_KEY = /\bt\(\s*"([a-zA-Z0-9_.]+)"/g;
/**
 * ``t(`a.b.${x}`)``. A family selected at runtime, as the deployment report
 * does for `status.pass` / `status.warn` / `status.fail` / `status.unknown`.
 * Only the fixed prefix can be checked, and checking that it names a real
 * object is exactly what would have caught finding 179.
 */
const PREFIX_KEY = /\bt\(\s*`([a-zA-Z0-9_.]+)\$\{/g;

function collect(): { literal: Set<string>; prefix: Set<string> } {
  const literal = new Set<string>();
  const prefix = new Set<string>();
  for (const file of sourceFiles(HERE)) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(LITERAL_KEY)) {
      literal.add(match[1]!);
    }
    for (const match of text.matchAll(PREFIX_KEY)) {
      prefix.add(match[1]!.replace(/\.$/, ""));
    }
  }
  return { literal, prefix };
}

function resolve(key: string): unknown {
  return key
    .split(".")
    .reduce<unknown>(
      (acc, part) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined,
      en,
    );
}

describe("every governance i18n key resolves", () => {
  const { literal, prefix } = collect();

  it("finds keys to check, so a broken collector cannot pass silently", () => {
    // Without this the regexes could stop matching and every assertion below
    // would vacuously succeed, which is the failure mode of a test that
    // iterates over something it gathered itself.
    expect(literal.size).toBeGreaterThan(200);
  });

  it("resolves every literal key to a string", () => {
    const broken = [...literal].filter((key) => typeof resolve(key) !== "string").toSorted();

    expect(broken).toEqual([]);
  });

  it("resolves every interpolated key's prefix to an object", () => {
    // `t(\`governance.deployment.status.${check.status}\`)` cannot be resolved
    // fully without knowing the runtime value, but its prefix must name a real
    // group of strings. Finding 179 would have failed exactly here.
    const broken = [...prefix]
      .filter((key) => {
        const value = resolve(key);
        return !value || typeof value !== "object";
      })
      .toSorted();

    expect(broken).toEqual([]);
  });
});
