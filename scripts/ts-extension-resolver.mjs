// ESM resolver hook mapping `./x.js` specifiers onto `./x.ts` sources.
//
// The project uses TypeScript's NodeNext convention, where a TypeScript file
// imports its sibling as `./roles.js` even though only `roles.ts` exists on
// disk — the extension refers to the *emitted* file. Node 22 strips types from
// `.ts` files natively but does not perform that specifier rewrite, so running
// the sources directly needs this shim.
//
// Used by the Linux verification harness so the platform checks run against the
// real source with no build step and no dependency install.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.endsWith(".js")) {
      throw error;
    }
    const parentUrl = context.parentURL ?? import.meta.url;
    const candidate = new URL(specifier, parentUrl);
    const asTypeScript = fileURLToPath(candidate).replace(/\.js$/, ".ts");
    if (!existsSync(asTypeScript)) {
      throw error;
    }
    return {
      url: pathToFileURL(asTypeScript).href,
      format: "module-typescript",
      shortCircuit: true,
    };
  }
}
