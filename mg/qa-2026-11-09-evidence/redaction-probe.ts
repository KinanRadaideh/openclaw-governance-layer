// QA 2026-11-09, finding 454: which ordinary resources does the ledger's redaction change?
// A change means "Always allow" would no longer file a rule for that resource, so this must stay
// on real secrets. Usage (repo root): node_modules/.bin/tsx mg/qa-2026-11-09-evidence/redaction-probe.ts
import { redactFreeFormSecrets } from "../../src/logging/redact-free-form.js";
import { redactToolPayloadText } from "../../src/logging/redact.js";

const samples = [
  "git show 632e6e3a3d3",
  "git log abcdef1234567890abcdef1234567890abcdef12",
  "git diff 0123456789abcdef0123456789abcdef01234567..HEAD",
  "npm install lodash@4.17.21",
  "curl https://api.example.com/v1/items?id=123&page=2",
  "docker run --rm -e NODE_ENV=production node:20",
  "cat 3f8a9c2e-7b1d-4e6a-9f0c-2d5b8e1a4c7f.json",
  "python3 -c \"print('hello')\"",
  "ls -la src/governance",
  "src/governance/policy-engine.ts",
  "C:/Users/kinan/.ssh/id_rsa",
  "api.openweathermap.org",
  "echo dGhpcyBpcyBqdXN0IGJhc2U2NA==",
  "openssl rand -hex 32",
  "export PASSWORD_FILE=/run/secrets/db",
  'curl -H "Authorization: Bearer sk-ant-api03-QAPROBEabcdefghijklmnopqrstuvwxyz0123456789" https://x',
  "mysql -u root -pS3cretPassw0rd db",
  "git clone https://user:ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123@github.com/o/r",
  "aws configure set aws_secret_access_key wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
];
for (const sample of samples) {
  const redacted = redactFreeFormSecrets(redactToolPayloadText(sample));
  console.log(
    `${redacted === sample ? "same   " : "CHANGED"} ${sample.slice(0, 70)}${redacted === sample ? "" : `  ->  ${redacted.slice(0, 70)}`}`,
  );
}
