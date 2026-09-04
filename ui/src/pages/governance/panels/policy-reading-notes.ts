// The three notes above the rule list: what an operator has to know to read
// that list correctly.
//
// **Its own module for the reason `policy-root-settings.ts` and
// `policy-agent-timeout.ts` have one.** Adding the third note took
// `policy-panels.ts` to 701 lines against the 700-line limit this project
// inherited, and the lint gate refused the commit. That gate exists because
// finding 136 was this exact limit being crossed unnoticed while the
// documentation asserted it was clean, and T16's answer to it was to split
// rather than to suppress. This is the same answer, and this is the third time
// it has been given: same limit, same gate, three separate weeks.
//
// The seam is a real one rather than a convenient one. These three rows carry
// no controls at all — `control: nothing` on every one of them — and they are
// the only rows in the section that are purely explanatory. A reader asking
// "what does this set of rules actually do?" is answered here; a reader
// changing something is answered by everything else in `policy-panels.ts`.
//
// ## Why they are on the page rather than in a tooltip
//
// All three were already true and none was visible. Precedence lived in the
// `title=` attribute of the effect dropdown in the authoring form: hover-only,
// absent on touch, and gone entirely once you are reading rules rather than
// writing one. The search limitation was in the backlog and in the report and
// nowhere a person using the page could see it. The split core tier was
// visible only as a button present on some rows and absent on others.
//
// They sit **above** the rules because that is where the reader is when the
// question arises. Putting them beside the authoring form would answer them
// only for whoever is authoring, and the person who needs the search caveat
// most is the one reading back a grant somebody else wrote.
import { nothing, type TemplateResult } from "lit";
import { renderSettingsRow } from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";

/**
 * The reading notes, in the order the questions occur to a reader.
 *
 * `isRoot` gates only the third: the split core tier is a distinction about a
 * control only Root is offered, so explaining it to an Administrator would be
 * answering a question they are not being asked.
 */
export function renderPolicyReadingNotes(isRoot: boolean): Array<TemplateResult | typeof nothing> {
  return [
    // Which rule wins. A denial outranks every allowance, and the list is
    // ordered the way the engine evaluates it.
    renderSettingsRow({
      title: t("governance.policy.evaluationTitle"),
      description: t("governance.policy.evaluationHint"),
      control: nothing,
    }),
    // **A disclosed limitation rather than a warning about a mistake, and it is
    // worded as one.** An interface that lets somebody express "this folder,
    // except that subfolder" while a search walks straight through the
    // exception is making a promise the gate does not keep. That is the failure
    // this project has recorded four times in code (findings 112, 113, 120,
    // T28), and here it would be making it to a person, in words they chose. It
    // stays visible until T7's prevention half closes it, and then it goes.
    renderSettingsRow({
      title: t("governance.policy.searchCaveatTitle"),
      description: t("governance.policy.searchCaveatHint"),
      control: nothing,
    }),
    // **The third, and it is the one an operator asks out loud** (finding 247).
    //
    // The core tier is split (T24): most shipped denials are ordinary security
    // opinions Root may switch off, and the rest exist to stop the governed
    // agent reaching the layer that governs it, so nobody may switch those off
    // at all. The list showed that decision as nothing but a missing button on
    // some rows and not others, which reads as a page that failed to render
    // rather than as a rule being enforced.
    //
    // Said once, here, rather than repeated on each locked row: it is a fact
    // about the tier, not about any one rule. The rows themselves say only
    // "Cannot be switched off", which is the same shape the Root account row
    // uses for the role it cannot be given.
    isRoot
      ? renderSettingsRow({
          title: t("governance.policy.coreTierTitle"),
          description: t("governance.policy.coreTierHint"),
          control: nothing,
        })
      : nothing,
  ];
}
