# Round sixteen probes

The scripts that produced findings 104-107, kept as artefacts rather than as
suite members. Copy one into `src/governance/` to run it; the imports assume
that location.

Each was written **before** re-reading the code it attacks, from the claim being
tested rather than from the implementation. The method rounds thirteen and
fourteen used, and the reason those rounds found things the previous twelve did
not.

| Probe                | Findings | Outcome                                         |
| -------------------- | -------- | ----------------------------------------------- |
| `probe-lock.test.ts` | 104, 105 | Both confirmed and fixed. 106 did not reproduce |
| `probe-auth.test.ts` | 107      | Confirmed and fixed; 108-111 found nothing      |

A probe that finds nothing is kept too. Four of the five authentication attacks
came back clean, and knowing which attacks were tried and failed is worth as
much to the next reviewer as knowing which succeeded.
