import { register } from "node:module";
import { pathToFileURL } from "node:url";
register("./ts-extension-resolver.mjs", pathToFileURL("./scripts/"));
