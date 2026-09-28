// Prints which sections of chapter3.tex are written and which are still
// outline, so the status can be re-derived instead of trusted.
//
// Written 2026-09-22, because the handover quoted "11 written, 45 stubbed"
// alongside a `grep -c sectionstub`, and that grep returns 51: it also counts
// the \providecommand definition and the mentions inside header comments. A
// re-derivation command that disagrees with the number beside it is worse than
// no command at all.
//
//   node docs-notes/report/section-status.mjs
//   node docs-notes/report/section-status.mjs --stubs-only

import { readFileSync } from "node:fs";

const PATH = "docs-notes/report/chapter3.tex";
const stubsOnly = process.argv.includes("--stubs-only");

const lines = readFileSync(PATH, "utf8").split("\n");
const sectionRe = /^\\(sub)?(sub)?section\{(.+)\}\s*$/;

let current = null;
const sections = [];
for (let i = 0; i < lines.length; i++) {
  const match = lines[i].match(sectionRe);
  if (match) {
    current = {
      name: match[3],
      depth: (match[1] ? 1 : 0) + (match[2] ? 1 : 0),
      line: i + 1,
      stub: false,
    };
    sections.push(current);
    continue;
  }
  // A heading owns every line until the next heading, so a \sectionstub here
  // belongs to `current`.
  if (current && lines[i].includes("\\sectionstub")) {
    current.stub = true;
  }
}

const written = sections.filter((s) => !s.stub);
const stubs = sections.filter((s) => s.stub);

for (const s of stubsOnly ? stubs : sections) {
  const state = s.stub ? "STUB   " : "WRITTEN";
  console.log(`${state} L${String(s.line).padStart(4)}  ${"  ".repeat(s.depth)}${s.name}`);
}

console.log(`\nwritten ${written.length} | stub ${stubs.length} | total ${sections.length}`);
