// M10 probe (QA of 2026-11-09): does the redacted form a held question stores still look like a
// secret to the ledger's redaction? If it does, the `containsSecret` mark is a second guard and
// the hand-written test input could not tell the two apart.
import { redactLedgerText } from "../../src/governance/audit-ledger.js";

const SECRET = "sk-ant-api03-QA454abcdefghijklmnopqrstuvwxyz0123456789";
const samples = [
  `curl -H "Authorization: Bearer ${SECRET}" https://api.example.com/x`,
  `curl -H "x-api-key: ${SECRET}" https://api.example.com/x`,
  `mysql --password=${SECRET} db`,
  `export OPENAI_API_KEY=${SECRET}`,
  `curl https://api.example.com/x?token=${SECRET}`,
  `git clone https://user:${SECRET}@example.com/repo.git`,
  'curl -H "Authorization: Bearer sk-ant…6789" https://api.example.com/x',
];
for (const sample of samples) {
  const once = redactLedgerText(sample);
  const twice = redactLedgerText(once);
  console.log(
    JSON.stringify({ sample: sample.slice(0, 40), once, stableOnSecondPass: once === twice }),
  );
}
