// Isolated Gateway fixture for the T95/T96 live run (2026-11-09). Own state, governance folder,
// home and port; nothing shared with any other Gateway. The token goes to a file, never printed.
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)).replaceAll("\\", "/");
for (const dir of ["state", "gov", "home", "ws-main", "ws-temp"]) {
  mkdirSync(join(here, dir), { recursive: true });
}
const token = randomBytes(24).toString("hex");
writeFileSync(join(here, "gateway-token.txt"), token);
const config = {
  gateway: { mode: "local", bind: "loopback", auth: { mode: "token", token } },
  agents: { list: [{ id: "main", default: true, workspace: `${here}/ws-main` }] },
};
writeFileSync(join(here, "state", "openclaw.json"), `${JSON.stringify(config, null, 2)}\n`);
// Test credentials for the dashboard's first-run Root account, kept here and not in chat.
writeFileSync(
  join(here, "accounts.json"),
  `${JSON.stringify({ root: { name: "rootqa", password: `T9596-${randomBytes(9).toString("base64url")}!a1` } }, null, 1)}\n`,
);
console.log(`fixture ready under ${here}`);
