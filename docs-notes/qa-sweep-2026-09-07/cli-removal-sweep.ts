// The governance command line is gone, and nothing else went with it.
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-07/cli-removal-sweep.ts
//
// ## Why this exists as a probe rather than as a test
//
// A removal is the one change where the suite passing proves the least. Deleting
// a surface deletes its tests, so the count goes **down** and everything left is
// green by construction. The two questions that actually matter are things no
// remaining test asks:
//
//   1. **Is it really gone?** Not "do the files exist" — whether the command
//      registry still offers `governance`, and whether anything still reaches
//      for the modules that backed it.
//   2. **Did anything else go with it?** The governance group was one entry in a
//      registry shared with every other `openclaw` command. `onboard`, `daemon`,
//      `models`, `config`, `agent`, `cron`, `doctor` are **upstream** and must be
//      untouched. This is the check Kinan asked for by name.
//
// A third, quieter one: the removal must not have touched **enforcement**. The
// gate sits at `runBeforeToolCallHook`, not on any operator surface, so an agent
// must still be refused exactly as before. That is asserted here rather than
// assumed, because "we only deleted an operator surface" is a claim about blast
// radius and this project has been wrong about blast radius before.
import { existsSync, mkdtempSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.OPENCLAW_GOVERNANCE_DIR = mkdtempSync(path.join(tmpdir(), "gov-rm-"));

const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

/** Every file the removal deleted, by the path it used to live at. */
const REMOVED = [
  "src/cli/program/register.governance.ts",
  "src/cli/program/register.governance.agents.ts",
  "src/cli/program/register.governance.backend.ts",
  "src/cli/program/register.governance.organisation.ts",
  "src/cli/program/register.governance.policy.ts",
  "src/cli/program/register.governance.requests.ts",
  "src/cli/program/governance-cli-gate.ts",
  "src/governance/cli-identity.ts",
];

/**
 * Upstream command groups. **None of these is ours**, and the whole point of
 * checking them is that the governance group shared a registry with them.
 */
const UPSTREAM_GROUPS = [
  "onboard",
  "daemon",
  "models",
  "config",
  "agent",
  "cron",
  "doctor",
  "dashboard",
  "audit",
  "message",
];

/**
 * The governance-owned part of a file, for the prose check above.
 *
 * `en.ts` is one object holding every locale string in the product, and only
 * the `governance:` block belongs to this layer — the rest is upstream's and
 * legitimately mentions a CLI that still exists. Tracked by brace depth from
 * the `governance: {` key rather than by indentation, which a formatter is free
 * to change.
 *
 * Any other file passed here is returned whole: everything under
 * `ui/src/pages/governance` is ours by definition.
 */
function scopeToGovernance(filePath: string, text: string): string {
  // `filePath`, not `path`: this module imports node's `path`, and shadowing it
  // inside a helper that also joins paths is how the wrong one gets called.
  if (!filePath.replaceAll("\\", "/").endsWith("i18n/locales/en.ts")) {
    return text;
  }
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^\s*governance:\s*\{\s*$/.test(line));
  if (start === -1) {
    return "";
  }
  let depth = 0;
  const out: string[] = [];
  for (let at = start; at < lines.length; at += 1) {
    const line = lines[at] ?? "";
    out.push(line);
    depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (at > start && depth <= 0) {
      break;
    }
  }
  return out.join("\n");
}

async function main(): Promise<void> {
  console.log(`governance dir: ${process.env.OPENCLAW_GOVERNANCE_DIR}\n`);

  // ==========================================================================
  // 1. The files are gone, and their archive is not.
  // ==========================================================================
  const stillPresent = REMOVED.filter((file) => existsSync(file));
  check(
    "every governance CLI source file is gone from the tree",
    stillPresent.length === 0,
    stillPresent.length === 0
      ? `all ${REMOVED.length} removed`
      : `still present: ${stillPresent.join(", ")}`,
  );

  const archived = REMOVED.filter((file) =>
    existsSync(path.join("docs-notes/removed-cli-surface/source", `${path.basename(file)}.txt`)),
  );
  check(
    "and every one of them is in the archive, so the removal is reversible",
    archived.length === REMOVED.length,
    `${archived.length} of ${REMOVED.length} archived under docs-notes/removed-cli-surface/source/`,
  );

  // ==========================================================================
  // 2. The command registry no longer offers `governance`, and still offers
  //    everything upstream.
  // ==========================================================================
  //
  // `getCoreCliCommandNames()` is the registry's own accessor, so this asks the
  // source of truth rather than parsing help output — a different thing that
  // can agree by accident. The first draft of this probe walked the module's
  // exports by reflection, found nothing, and reported it as a failure rather
  // than as a green check, which is the only reason it was noticed.
  // **Both registries, read from their declarations.** `getCoreCliCommandNames()`
  // covers the core group; `daemon`, `models` and `cron` are declared in
  // `register.subclis-core.ts`, whose groups are function calls rather than
  // serialisable data, so the names are read from the source text. The first
  // draft checked only the core registry and reported those three as casualties
  // of the removal — a probe that does not know where a thing lives will report
  // its own ignorance as a defect, which is the third time that has happened
  // this session.
  const { getCoreCliCommandNames } = await import("../../src/cli/program/command-registry-core.ts");
  const subcliSource = await readFile("src/cli/program/register.subclis-core.ts", "utf8");
  const fromSubclis = [...subcliSource.matchAll(/commandNames:\s*\[([^\]]*)\]/g)].flatMap((match) =>
    [...match[1].matchAll(/"([a-z][a-z-]*)"/g)].map((name) => name[1]),
  );
  const names = new Set([...getCoreCliCommandNames(), ...fromSubclis]);

  if (names.size === 0) {
    check(
      "the command registry could be read",
      false,
      "no command names were returned at all — this probe cannot say anything about the registry, and a green result here would be meaningless",
    );
  } else {
    check(
      "the registry no longer offers a `governance` command group",
      !names.has("governance"),
      names.has("governance")
        ? "`governance` is still registered — the surface is reachable"
        : `${names.size} command names registered, and "governance" is not among them`,
    );

    const missingUpstream = UPSTREAM_GROUPS.filter((name) => !names.has(name));
    check(
      "and every upstream command group is still registered",
      missingUpstream.length === 0,
      missingUpstream.length === 0
        ? `all ${UPSTREAM_GROUPS.length} present: ${UPSTREAM_GROUPS.join(", ")}`
        : `MISSING: ${missingUpstream.join(", ")} — the removal reached beyond the governance layer`,
    );
  }

  // ==========================================================================
  // 2b. The **build**, not just the source (finding 284).
  // ==========================================================================
  //
  // **This check exists because everything above it passed while the command
  // line still worked.** Sources gone, both registries clean, the `--help`
  // descriptor removed, three typechecks and both lint gates green, this sweep
  // 7/7 — and `dist/` still held the whole compiled command tree, so
  // `openclaw governance …` ran fine on any machine using the shipped artefact.
  //
  // Every other check in this project reads the **source tree**. What a user
  // runs is the **build**. Nothing was comparing them, and finding 274 is why
  // that persists: nothing in the build ever clears `dist/`, so a plain
  // `pnpm build` leaves an orphaned compiled surface there indefinitely. Only
  // `rm -rf dist && pnpm build` removes it.
  //
  // Skipped rather than failed when there is no build at all: a tree that has
  // not been built yet is not a tree with a stale surface in it, and reporting
  // "clean" for an absent `dist/` would be the same false comfort this check
  // exists to remove.
  if (!existsSync("dist")) {
    skip(
      "the built artefact no longer contains the command line",
      "there is no dist/ to inspect — build first, then re-run. An absent build is not a clean one",
    );
  } else {
    const distEntries = await readdir("dist");
    const compiled = distEntries.filter((name) => name.startsWith("register.governance"));
    check(
      "the built artefact no longer contains the compiled command tree",
      compiled.length === 0,
      compiled.length === 0
        ? `dist/ holds ${distEntries.length} entries and none is a compiled register.governance chunk`
        : `dist/ still contains ${compiled.join(", ")} — the source is gone and the product is not. Run \`rm -rf dist && pnpm build\`; a plain rebuild will not clear it (finding 274)`,
    );
  }

  // ==========================================================================
  // 3. Enforcement is untouched, which is the claim that matters.
  // ==========================================================================
  const { seedGroupWithAgents } = await import("../../src/governance/test-group.ts");
  const { evaluateGovernancePolicy } = await import("../../src/governance/policy-engine.ts");
  const { savePolicy } = await import("../../src/governance/policy-store.ts");
  const { defaultPolicyDocument } = await import("../../src/governance/policy-types.ts");

  const group = await seedGroupWithAgents(["jack"]);
  await savePolicy(group, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });

  const unlisted = await evaluateGovernancePolicy(
    { toolName: "exec", params: { command: "curl evil.example.com" } },
    { agentId: "jack", sessionKey: "agent:jack:main" },
  );
  check(
    "an unlisted action is still refused, so removing an operator surface did not touch the gate",
    Boolean(unlisted && typeof unlisted === "object" && "block" in unlisted),
    `the gate answered: ${JSON.stringify(unlisted)}`,
  );

  const credential = path.join(tmpdir(), ".npmrc");
  const core = await evaluateGovernancePolicy(
    { toolName: "read", params: { path: credential } },
    { agentId: "jack", sessionKey: "agent:jack:main" },
  );
  check(
    "and a core-tier denial still fires — the T2 demonstration would still hold",
    Boolean(core && typeof core === "object" && "block" in core),
    `a read of ${credential} answered: ${JSON.stringify(core)}`,
  );

  // ==========================================================================
  // 3b. Nothing still *tells an operator* to run it (finding 285).
  //
  // Added 2026-09-07 (iv), and it is the check that would have caught the worst
  // consequence of this removal. Every check above this one asks whether the
  // code still **reaches** the deleted surface — imports, registries,
  // descriptors, compiled chunks. None of them can see a **sentence**.
  //
  // `oversight-panels.ts` printed "Run `openclaw governance audit verify` at the
  // terminal to recompute this independently of the dashboard" for a day after
  // the command was deleted. That row is finding 268's fix: the repair whose
  // entire claim is that requirement 8's verdict need not be taken on trust. It
  // survived the removal's nineteen-document rewrite because that pass grepped
  // `.md` files, and it survived every gate because `openclaw governance audit
  // verify` is not an identifier — no typecheck, lint rule or import graph has
  // an opinion about the contents of a string.
  //
  // So this greps the **UI source** for the words an operator would type. It is
  // deliberately the shipped operator surface only: `src/governance/` comments
  // discuss the removed surface as history on purpose, and `docs-notes/` is
  // where the archive lives.
  // ==========================================================================
  const uiRoots = ["ui/src/pages/governance", "ui/src/i18n/locales"];
  const offenders: string[] = [];
  for (const root of uiRoots) {
    const stack = [root];
    while (stack.length > 0) {
      const dir = stack.pop() as string;
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
          continue;
        }
        // **Tests are excluded, and the first run is why.** This check flagged
        // `governance-panels.test.ts`, whose whole contribution is the
        // assertion `expect(text()).not.toContain("openclaw governance")` — the
        // guard added for 285. A probe that reports the guard against a defect
        // as the defect is the eleventh fixture fault this fortnight, and the
        // shipped operator surface is what the check is about: a test is not
        // something an operator reads.
        if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) {
          continue;
        }
        const text = await readFile(full, "utf8");
        // The comment added with the fix quotes the old command to explain what
        // went wrong, so a bare substring match would report the explanation as
        // the defect. Only lines that are not comments count.
        // **Two patterns, because one of them missed a live string for a day**
        // (finding 320). This check searched only for the command's spelling,
        // `openclaw governance ...`, and passed while
        // `governance.sessions.unavailableHint` told every operator who met it
        // that the view "is not available from the CLI". A sentence can name a
        // removed surface without naming a command, and the prose is what an
        // operator actually reads.
        //
        // The prose pattern is applied to the **governance** strings only:
        // `en.ts` also carries upstream sentences about `openclaw update` "from
        // the CLI", which is a host command that still exists, and flagging
        // those would make this check noise. `scopeToGovernance` does that
        // narrowing; for files under `ui/src/pages/governance` it is the whole
        // file.
        const scoped = scopeToGovernance(full, text);
        const hits = scoped
          .split("\n")
          .filter(
            (line) =>
              line.includes("openclaw governance") || /\bthe CLI\b|\bcommand line\b/i.test(line),
          )
          .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));
        if (hits.length > 0) {
          offenders.push(`${full}: ${hits[0]?.trim().slice(0, 120)}`);
        }
      }
    }
  }
  check(
    "no operator-facing string still tells anyone to run the removed command line",
    offenders.length === 0,
    offenders.length === 0
      ? `${uiRoots.join(" and ")} carry no live "openclaw governance ..." text — the check that finding 285 needed and that no typecheck, lint rule or import graph can perform`
      : `still advertised to an operator: ${offenders.join(" | ")}`,
  );

  // ==========================================================================
  // 4. The labelled origin stays reserved, though nothing writes it any more.
  // ==========================================================================
  //
  // Historic ledger entries name `cli`, and the chain is tamper-evident, so
  // those entries stand. The name must stay reserved or a future account called
  // `cli` would have its actions read as historical command-line ones.
  // Asserted by **behaviour**, not by reading the set: `RESERVED_ACTOR_NAMES` is
  // module-private, and a probe that reached into it would be testing a shape
  // rather than a guarantee.
  const { CLI_ACTOR, FabricatedActorError, recordAdminAction, ADMIN_ACTIONS } =
    await import("../../src/governance/admin-audit.ts");
  let refusedAsFabricated = false;
  try {
    await recordAdminAction(group, {
      actor: { name: CLI_ACTOR, role: "root" },
      action: ADMIN_ACTIONS.userDelete,
      target: "a real account trying to write an entry that reads as the old command line",
    });
  } catch (err) {
    refusedAsFabricated = err instanceof FabricatedActorError;
  }
  check(
    "`cli` is still refused as an account identity, so no account can inherit the old entries' name",
    refusedAsFabricated,
    refusedAsFabricated
      ? `writing a ledger entry as a named account called "${CLI_ACTOR}" throws FabricatedActorError — historic command-line entries keep their meaning and cannot be impersonated`
      : `a named account was allowed to write as "${CLI_ACTOR}", so entries from the removed surface can now be forged`,
  );

  const failed = results.filter((entry) => !entry.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
