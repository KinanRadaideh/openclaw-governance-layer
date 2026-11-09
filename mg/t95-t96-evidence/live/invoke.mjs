// Sends one governed web_fetch through POST /tools/invoke on the isolated Gateway, as agent main,
// and prints the verdict in one line. Usage: node invoke.mjs <host>   (e.g. 127.0.0.2)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const token = readFileSync(join(here, "gateway-token.txt"), "utf8").trim();
const [host] = process.argv.slice(2);
const res = await fetch("http://127.0.0.1:18895/tools/invoke", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify({
    tool: "web_fetch",
    args: { url: `http://${host}:18897/t95` },
    agentId: "main",
  }),
});
const text = await res.text();
const fetched = text.includes(`hello from ${host}`);
console.log(
  `${new Date().toISOString()} main web_fetch ${host} -> HTTP ${res.status} ${fetched ? "FETCHED" : "REFUSED"} :: ${text.replace(/\s+/g, " ").slice(0, 240)}`,
);
