// M19: remove both popup adoptions (route-time and page-event); the popup test must fail.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const file = "extensions/browser/src/browser/governed-page-requests.ts";
const original = fs.readFileSync(file, "utf8");
const a = "if (!page || pageOwners.has(page)) {";
const b = "            adopt(popup, owner);";
if (!original.includes(a) || !original.includes(b)) {
  throw new Error("mutation text not found");
}
fs.writeFileSync(file, original.replace(a, "if (true) {").replace(b, "            void owner;"));
let killed;
try {
  execFileSync(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--config",
      "test/vitest/vitest.extension-browser.config.ts",
      "extensions/browser/src/browser/governed-page-requests.chrome.test.ts",
    ],
    { stdio: "pipe", timeout: 300_000 },
  );
  killed = false;
} catch {
  killed = true;
} finally {
  fs.writeFileSync(file, original);
}
console.log(`M19 both popup adoptions removed: ${killed ? "killed" : "SURVIVED"}`);
