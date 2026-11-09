// Sends one governed web_fetch through POST /tools/invoke on the isolated Gateway (port 18899),
// as agent main, and prints the verdict in one line.
// Usage: node invoke.mjs <fixture dir> <label> <url>
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [root, label, url] = process.argv.slice(2);
const token = readFileSync(join(root, "gateway-token.txt"), "utf8").trim();
const res = await fetch("http://127.0.0.1:18899/tools/invoke", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
  body: JSON.stringify({ tool: "web_fetch", args: { url }, agentId: "main" }),
});
const text = await res.text();
const fetched = /hello from 127/.test(text);
console.log(
  `${label}: ${JSON.stringify(url.length > 80 ? `${url.slice(0, 60)}…${url.slice(-20)}` : url)} -> HTTP ${res.status} ${fetched ? "FETCHED" : "REFUSED"} :: ${text.replace(/\s+/g, " ").slice(0, 200)}`,
);
