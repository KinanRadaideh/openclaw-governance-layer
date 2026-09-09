import type { TranslationMap } from "../lib/types.ts";
// The complete Control UI English catalog: the i18n pipeline's source of truth.
//
// **This module is not what the running app loads** (2026-09-09, decision T64).
// It is assembled from the two modules below so that `scripts/control-ui-i18n.ts`
// and `scripts/control-ui-i18n-verify.ts` — which import this file and read
// `en` — keep seeing every key exactly as before, and the twenty translated
// locales keep every string they have.
//
// The app loads `en-core.ts` at startup and each lazy page loads its own
// `en-<page>.ts`. Nothing in `ui/src` outside the pipeline and its tests should
// import this file: doing so would pull every page's strings back into whatever
// chunk the importer lands in, which is the cost this split exists to remove.
//
// `governance` therefore appears **after** the core keys rather than in its old
// position. Key order is derived from this object wherever it matters, so the
// generated catalogs follow it; nothing compares against a recorded order.
import { enCore } from "./en-core.ts";
import { enGovernance } from "./en-governance.ts";

export const en: TranslationMap = { ...enCore, ...enGovernance };
