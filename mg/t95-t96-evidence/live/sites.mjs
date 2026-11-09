// Three loopback "sites" for the T95 live run, one per network rule: 127.0.0.2 (rule expired 30
// days ago), 127.0.0.3 (rule with an unreadable expiry), 127.0.0.4 (live rule). Each request is
// appended to sites-log.txt, so a refused fetch is proven by its absence there.
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const log = join(dirname(fileURLToPath(import.meta.url)), "sites-log.txt");
for (const host of ["127.0.0.2", "127.0.0.3", "127.0.0.4"]) {
  createServer((req, res) => {
    appendFileSync(log, `${new Date().toISOString()} ${host} ${req.method} ${req.url}\n`);
    res.writeHead(200, { "content-type": "text/plain" });
    res.end(`hello from ${host}\n`);
  }).listen(18897, host, () => console.log(`listening ${host}:18897`));
}
