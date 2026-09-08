// Audits the project's own documentation against the tree it describes.
//
// **Written because reading them does not work.** Findings 220, 227, 236, 259,
// 282, 294 and 323 are all one shape: a number or a claim that was true when it
// was typed, in a file nobody re-derives, contradicted by another file that was
// updated. Six of those were found by a person noticing two documents
// disagreeing, which is luck rather than method.
//
// What this checks, and nothing else — each is a claim a machine can settle:
//
//   1. **Dead file references.** A doc naming `src/…`, `ui/…`, `scripts/…`,
//      `docs-notes/…` or `mg/…` that does not exist. The command line's removal
//      on 2026-09-07 deleted fourteen files that documents still pointed at.
//   2. **The removed command line, in prose as well as in commands.** Finding
//      320's lesson: `cli-removal-sweep.ts` greps for the *spelling*
//      `openclaw governance …`, and the string that survived every sweep named
//      the surface in words instead.
//   3. **Disagreeing finding counts.** Every "N found / N fixed / N open" claim
//      across every register, listed together so a reader can see them
//      disagree.
//
//   node docs-notes/qa-sweep-2026-09-08/doc-audit.mjs
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

/** Documents this audit reads. Operator-facing and handover, not upstream's. */
const DOC_DIRS = ["mg", "docs-notes"];
const DOC_FILES = ["README.md", "GOVERNANCE.md", "VISION.md"];

function docs() {
  const found = [];
  for (const file of DOC_FILES) {
    if (existsSync(join(root, file))) {
      found.push(file);
    }
  }
  for (const dir of DOC_DIRS) {
    const base = join(root, dir);
    if (!existsSync(base)) {
      continue;
    }
    for (const entry of readdirSync(base)) {
      const full = join(base, entry);
      if (statSync(full).isFile() && entry.endsWith(".md")) {
        found.push(`${dir}/${entry}`);
      }
    }
  }
  return found;
}

/**
 * Repo-relative paths a document points at.
 *
 * Deliberately narrow: only the four source roots this project owns, only with
 * a file extension, and only inside backticks. A looser pattern matches prose
 * ("see src/governance for the store") and turns the report into noise nobody
 * reads — which is the failure mode this file exists to avoid, not to repeat.
 */
const PATH_RE =
  /`((?:src|ui|scripts|test|docs-notes|mg|packages|extensions)\/[\w./-]+\.\w{1,5})`/gu;

/** Prose naming the removed surface, rather than its spelling (finding 320). */
const CLI_PROSE_RE =
  /\b(?:openclaw\s+governance\s+\w+|the\s+governance\s+(?:command\s+line|CLI))\b/giu;

/** Any "N found, N fixed, N open"-shaped claim about the defect register. */
const COUNT_RE =
  /(\d{2,4})\s*(?:found|defects?|findings?)[^.\n]{0,60}?(\d{2,4})\s*fixed[^.\n]{0,60}?(\d{1,3})\s*(?:open|outstanding)/giu;

const deadRefs = [];
const cliProse = [];
const counts = [];

for (const doc of docs()) {
  const text = readFileSync(join(root, doc), "utf8");
  const lines = text.split("\n");

  for (const [index, line] of lines.entries()) {
    // **A document naming a file it says was deleted is doing its job.** The
    // command line's removal is recorded in nine places, each of which names
    // the files that went; flagging those would make this report 39 rows long
    // and unreadable, and a check nobody reads is finding 224's other half.
    // So a line that is *about* a file no longer existing is skipped, and what
    // is left is a document pointing a reader at something that is not there.
    const historical =
      /~~|removed|deleted|renamed|superseded|no longer|used to|cited/iu.test(line);
    if (!historical) {
      for (const match of line.matchAll(PATH_RE)) {
        const target = match[1];
        // `ui/.../identity.ts` is prose with the middle elided, not a path.
        if (target.includes("...")) {
          continue;
        }
        if (!existsSync(join(root, target))) {
          deadRefs.push({ doc, line: index + 1, target });
        }
      }
    }
    for (const match of line.matchAll(CLI_PROSE_RE)) {
      cliProse.push({ doc, line: index + 1, text: match[0] });
    }
    for (const match of line.matchAll(COUNT_RE)) {
      // **A dated snapshot is not a disagreement.** A session log records the
      // state on the day it describes and must stay frozen; what makes it safe
      // is saying so, which is the convention this project already uses. So the
      // check is not "do all the numbers match" but "is every number that does
      // not match marked as history" — the distinction finding 227 turns on.
      if (/snapshot|as it stood|not the current count/iu.test(line)) {
        continue;
      }
      counts.push({ doc, line: index + 1, claim: `${match[1]}/${match[2]}/${match[3]}` });
    }
  }
}

function report(title, rows, render) {
  console.log(`\n=== ${title}: ${rows.length} ===`);
  for (const row of rows) {
    console.log(`  ${row.doc}:${row.line}  ${render(row)}`);
  }
}

report(
  "Dead file references (advisory: triage by hand, see the note below)",
  deadRefs,
  (row) => row.target,
);
report("Prose naming the removed command line", cliProse, (row) => `"${row.text}"`);
report("Defect-count claims (they must all agree)", counts, (row) => row.claim);

const distinct = new Set(counts.map((row) => row.claim));
console.log(`\ndistinct count claims: ${[...distinct].join("  ") || "(none)"}`);
// **Only the count check gates, and that is deliberate.**
//
// Dead references cannot be settled by a regular expression and this one should
// not pretend otherwise. Three kinds of survivor are correct as written: a path
// used as an *illustration* (`src/app.ts` in a note about path separators), a
// path named across two lines so the "removed" marker is on the other one, and
// an instruction telling a reader to *create* a file. Gating on the list would
// make the gate cry wolf, and a check nobody believes is finding 224's other
// half — this project has already paid for one of those.
//
// The count check does gate, because it is decidable: two documents claiming
// different totals for one register is always wrong, and it is the single
// failure mode (findings 220, 227, 236, 259, 282, 294) that keeps recurring.
process.exitCode = distinct.size > 1 ? 1 : 0;
