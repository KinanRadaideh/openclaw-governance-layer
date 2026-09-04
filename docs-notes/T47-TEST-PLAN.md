# T47: the by-hand test plan

**One list per RBAC tier, split between Kinan, Mohammad and Malek.**

Everything this project has verified so far is either automated or was driven by
whoever wrote it. What has never happened is **three people exercising the four
tiers from the operator's chair**: what a Root can do that an Administrator
cannot, what a User sees, what a Viewer is refused, and — the question that
matters most — **whether every refusal explains itself**.

This produces the operator-visible evidence Chapter 4 needs. It is the natural
companion to T2 (a real model, refused).

---

## 0. Before you start

### Who does what

| Person       | Signs in as           | Runs                             |
| ------------ | --------------------- | -------------------------------- |
| **Kinan**    | `Root`                | §1 Root, then §5 with the others |
| **Mohammad** | `Administrator`       | §2 Administrator                 |
| **Malek**    | `User`, then `Viewer` | §3 User, §4 Viewer               |

**Do not share one browser.** Each person on their own machine, own SSH tunnel,
own session. Half of what this plan tests is that one account cannot see or do
another's, and a shared browser session silently defeats that.

### Setup

1. Kinan updates the VPS to the current build (`mg/HANDOFF.md` §1, "Updating the
   VPS to the current build").
2. Kinan creates the Root account, then an Administrator for Mohammad.
3. Mohammad creates Malek's User account and assigns it one agent.
4. Malek's Viewer account is created last, at §4.

### How to record a result

Every row has three columns to fill in. **Write what actually happened, not
"OK".** The value of this exercise is in the wording of the refusals, and "OK"
throws that away.

```
| # | What you did | What you expected | What happened |
```

**Two things to write down every single time:**

- **Was the outcome visible?** An action that produces nothing, with nothing
  explaining why, is this project's worst bug class. If you clicked something
  and the screen did not change, that is a finding even if the server did the
  right thing.
- **Did the refusal say what to do instead?** "You cannot do that" is a
  half-finished refusal. "Only an Administrator can write a rule that binds
  every agent — name one of your agents instead" is a finished one.

### Screenshot everything that refuses you

Chapter 4 needs pictures of a system saying no. Name them
`tier-section-number.png`, e.g. `user-3.7.png`.

---

## 1. Root — Kinan

Root manages **people**. Administrator manages **agents**. That split is the
thing to keep checking: several of these rows exist because a Root control and
an Administrator control were once the same function.

### 1.1 Identity and the page itself

| #     | Do this                              | Expect                                                                                                                 |
| ----- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 1.1.1 | Open the dashboard before signing in | The page says **Governance** as its title, and shows a sign-in form, not a blank panel                                 |
| 1.1.2 | Sign in with the wrong password      | Refused. The message must **not** say whether the account exists                                                       |
| 1.1.3 | Get the password wrong five times    | Locked out, with the wait stated. Then wait it out and sign in                                                         |
| 1.1.4 | Sign in correctly                    | The Identity panel says `Kinan (root)`                                                                                 |
| 1.1.5 | Read the section list on the left    | Every entry jumps to a section that exists. Count them, and count the sections on the page: the two numbers must match |
| 1.1.6 | Sign out, then press Back            | You are signed out. The page does not show stale data from the session that ended                                      |

### 1.2 Accounts

| #      | Do this                                                        | Expect                                                                                      |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1.2.1  | Create an Administrator for Mohammad                           | Appears in the list with role `administrator`                                               |
| 1.2.2  | Try to create a second Root                                    | Refused, and the message says there can be only one                                         |
| 1.2.3  | Create a User with **no** Administrator chosen                 | Refused **before** you submit, or refused with a message naming what to fix                 |
| 1.2.4  | Create a User and pick Mohammad as its Administrator           | Created. The row shows who answers for it                                                   |
| 1.2.5  | Change that User to Viewer                                     | A confirmation appears **first**, naming the account and both roles                         |
| 1.2.6  | Try to change your own Root row's role                         | No control offered. The row states `root (permanent, cannot be changed)`                    |
| 1.2.7  | Set a new password on Mohammad's account                       | Succeeds. Mohammad's existing session should **stop working** — check with him              |
| 1.2.8  | Set your own password, sign out, sign back in with the new one | Works                                                                                       |
| 1.2.9  | Try to delete your own Root account                            | Refused, and the message names deleting the **organisation** as the act that does remove it |
| 1.2.10 | Delete a spare account you created for this                    | Confirmation names the account. Gone from the list                                          |

### 1.3 Withholding policy authoring (T27)

This is the row most likely to find something, because it is the only place two
different questions are deliberately kept apart.

| #     | Do this                                              | Expect                                                                                                                |
| ----- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1.3.1 | On Malek's User row, press **Withhold rule editing** | The button flips to offer granting it back                                                                            |
| 1.3.2 | Have Malek reload                                    | Malek can still see the Policy section and every rule in it                                                           |
| 1.3.3 | Ask Malek what is now missing                        | **The add-rule form, the folder-grant form, and Remove on every rule.** They should be gone, not present-and-refusing |
| 1.3.4 | Ask Malek to stop his agent                          | **Still works.** Withholding authoring must not take away stopping your own agent                                     |
| 1.3.5 | Ask Malek to submit a rule request                   | **Still works.** That is the whole point of the tier                                                                  |
| 1.3.6 | Grant it back, have Malek reload                     | The forms return                                                                                                      |

### 1.4 The shipped rules, and the split core tier (T24)

| #     | Do this                                         | Expect                                                                                                                                                      |
| ----- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.4.1 | Read the Policy section's rule list             | Core rules first, then baseline, then anything you wrote. Each shows its pattern in monospace beneath a plain-English description                           |
| 1.4.2 | Find a core denial with a **Switch off** button | e.g. "Privilege escalation (sudo, su, doas, runas, pkexec)"                                                                                                 |
| 1.4.3 | Find one **without** it                         | e.g. "The governance layer's own policy, accounts, audit ledger and signing key". The row must say **"Cannot be switched off"** rather than showing nothing |
| 1.4.4 | Read the row above the list explaining why      | It must explain the split without you having to hover anything                                                                                              |
| 1.4.5 | Switch off the privilege-escalation denial      | Confirmation first. The rule disappears from the list                                                                                                       |
| 1.4.6 | Run the deployment report                       | It should now report the installation as **failing**, naming that rule                                                                                      |
| 1.4.7 | Switch it back on                               | Report returns to passing                                                                                                                                   |

### 1.5 Root-only policy settings

| #     | Do this                                         | Expect                                                                   |
| ----- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| 1.5.1 | Set the escalation timeout to 30 seconds        | Accepted                                                                 |
| 1.5.2 | Set it to 2 seconds                             | Refused, and the message states the allowed range                        |
| 1.5.3 | Set a per-account ask override for Malek        | Accepted, and visible when you reload                                    |
| 1.5.4 | Set one for an account name that does not exist | **A warning, not a refusal** — and it must say the account was not found |
| 1.5.5 | Clear the override                              | Returns to the default                                                   |

### 1.6 The Codex backend

| #     | Do this                                | Expect                                                                                  |
| ----- | -------------------------------------- | --------------------------------------------------------------------------------------- |
| 1.6.1 | Read the row before touching it        | "Off by default. Nobody has enabled this, so the safe answer stands."                   |
| 1.6.2 | Open **Why this is off by default**    | Nine paragraphs, readable, not pressed against the edge of the card                     |
| 1.6.3 | Turn it on                             | A confirmation naming the enforcement gap. Read it — does it tell you what still works? |
| 1.6.4 | Cancel the dialog                      | The switch stays **off**. It must not flip and then flip back                           |
| 1.6.5 | Turn it on for real                    | On. Check the audit ledger records it against you                                       |
| 1.6.6 | Look at a path denial in the rule list | It should now carry the Codex search caveat                                             |
| 1.6.7 | Turn it off                            | A different warning, about supervised chats                                             |

### 1.7 The deployment report

| #     | Do this                                       | Expect                                                              |
| ----- | --------------------------------------------- | ------------------------------------------------------------------- |
| 1.7.1 | Open **Deployment and network posture**       | Rows for the listener, the ledger key's file mode, and the route in |
| 1.7.2 | Read the failing rows                         | Each names what to do about it, not just what is wrong              |
| 1.7.3 | `chmod 644` the ledger key on the VPS, reload | The key-permission row goes red and names the fix                   |
| 1.7.4 | `chmod 600` it back                           | Green again                                                         |

### 1.8 The organisation (do this LAST — it is irreversible)

| #     | Do this                             | Expect                                                           |
| ----- | ----------------------------------- | ---------------------------------------------------------------- |
| 1.8.1 | Open the Organisation panel         | It states what deletion removes: every account and every agent   |
| 1.8.2 | Type the wrong username to confirm  | Refused                                                          |
| 1.8.3 | Type your Root username and confirm | Everything goes. You land on the create-the-first-account screen |
| 1.8.4 | Check the audit ledger file on disk | **It is still there.** The trail is kept deliberately            |
| 1.8.5 | Verify the chain                    | Still intact                                                     |

---

## 2. Administrator — Mohammad

Administrator manages **agents**. Your scope is every agent in the
organisation; you do **not** manage people.

### 2.1 What you must not see

| #     | Do this                                                                                | Expect                                                   |
| ----- | -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 2.1.1 | Look for an Accounts section                                                           | **Not on your page at all.** Not present-and-disabled    |
| 2.1.2 | Look for the Organisation panel                                                        | Not there                                                |
| 2.1.3 | Look for Deployment and network posture                                                | Not there                                                |
| 2.1.4 | Look for a **Switch off** button on a core rule                                        | Not there. Lowering the shipped floor is Root's          |
| 2.1.5 | Ask Kinan for the API path of one of those, and call it with `curl` using your session | **Refused by the server**, not merely hidden by the page |

Row 2.1.5 is the important one. Everything the dashboard hides, the server must
also refuse. Hiding a control is a courtesy; it is never the control.

### 2.2 The agent registry

| #     | Do this                                                 | Expect                                                                                         |
| ----- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 2.2.1 | Open **Agents in your organisation** on a fresh install | "No agents yet", and an explanation of the two ways to get one                                 |
| 2.2.2 | Create an agent, leaving the owner blank                | Either refused before submitting, or a message naming what to choose                           |
| 2.2.3 | Create an agent with yourself as owner                  | It appears **and** exists in OpenClaw — check with `openclaw agents list`                      |
| 2.2.4 | Create a second agent with the same id                  | Refused as a duplicate                                                                         |
| 2.2.5 | Create one with the id typed in **different case**      | Refused as a duplicate. Case must not be a way round uniqueness                                |
| 2.2.6 | Register an agent OpenClaw already has                  | Recorded without creating a second one                                                         |
| 2.2.7 | Press Remove on an agent                                | **Two named options** with their consequences, then a confirmation stating it cannot be undone |
| 2.2.8 | Choose "unregister"                                     | The governance record goes; the OpenClaw agent stays                                           |
| 2.2.9 | Choose "delete" on another                              | Both go                                                                                        |

### 2.3 Assigning agents to people

| #     | Do this                                | Expect                                                   |
| ----- | -------------------------------------- | -------------------------------------------------------- |
| 2.3.1 | Assign your agent to Malek             | Saved. Malek sees it after a reload                      |
| 2.3.2 | Assign an agent id that does not exist | Refused, and the message says registration is required   |
| 2.3.3 | Type the id in different case          | Accepted and folded — Malek must still be able to use it |

### 2.4 Policy

| #     | Do this                                                       | Expect                                                             |
| ----- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| 2.4.1 | Add an allow rule for `^ls( .*)?$` binding every agent        | Accepted. You may write global rules; Malek may not                |
| 2.4.2 | Add the same rule again                                       | A conflict notice naming the earlier rule                          |
| 2.4.3 | Add a rule with a broken regular expression                   | Refused, with the error, before anything is stored                 |
| 2.4.4 | Add a rule with a pattern designed to be slow, e.g. `^(a+)+$` | Refused by the safety checker                                      |
| 2.4.5 | Add a rule with a 5-minute lifetime                           | Row shows when it expires. Come back later and confirm it is gone  |
| 2.4.6 | Press **Who does this affect?** on a global rule              | Names every agent it binds, and says it binds ones not created yet |
| 2.4.7 | Use **Allow a folder, except…**                               | Writes **two** rules and lists both back to you                    |
| 2.4.8 | Remove one of the two                                         | The other stays, and behaves as the explainer said it would        |
| 2.4.9 | Filter the rule list to a term matching nothing               | "No rules match your filter" — **not** "no rules exist"            |

### 2.5 Per-agent posture

| #     | Do this                              | Expect                                                     |
| ----- | ------------------------------------ | ---------------------------------------------------------- |
| 2.5.1 | Set one agent to **Monitor**         | Row appears showing the override                           |
| 2.5.2 | Have Malek look for the same control | **Not on his page.** These are Administrator and above     |
| 2.5.3 | Press **Use default**                | Override cleared                                           |
| 2.5.4 | Set a per-agent escalation timeout   | Accepted, and Malek **can** set this one for his own agent |

### 2.6 The emergency kill switch

| #     | Do this                                          | Expect                                                                                                               |
| ----- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 2.6.1 | Have Malek start a long prompt on his agent      | It shows under Active agent sessions                                                                                 |
| 2.6.2 | Stop that agent                                  | It reports whether it **actually stopped**, not just that it tried                                                   |
| 2.6.3 | Ask Malek what he saw                            | His prompt should have been cut off, with a reason                                                                   |
| 2.6.4 | Try any tool call on that agent                  | Refused                                                                                                              |
| 2.6.5 | Stop an agent using the id in **different case** | Must still stop it. **This is finding 202** — it once reported success and stopped nothing                           |
| 2.6.6 | Release the lockdown                             | Agent works again                                                                                                    |
| 2.6.7 | Stop an agent id that does not exist             | Refused with "no such agent" — and the wording must be identical to the refusal for an agent in another organisation |

### 2.7 Rule requests

| #     | Do this                              | Expect                                                                                      |
| ----- | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| 2.7.1 | Look at Malek's pending request      | Shows the pattern, the reason, who asked, and **whether it binds one agent or all of them** |
| 2.7.2 | Approve it                           | The rule appears in the policy list                                                         |
| 2.7.3 | Try to decide the same request again | Refused — the first decision stands                                                         |
| 2.7.4 | Reject another                       | Recorded as rejected, with your name on it                                                  |

---

## 3. User — Malek

You manage **the agents assigned to you** and nothing else.

### 3.1 What you see

| #     | Do this                                                                   | Expect                                                                    |
| ----- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 3.1.1 | Sign in                                                                   | Identity says `Malek (user)`                                              |
| 3.1.2 | Count your sections                                                       | No Accounts, no Organisation, no Deployment, no agent registry management |
| 3.1.3 | Look at **Your agents**                                                   | Only the agents assigned to you                                           |
| 3.1.4 | Ask Mohammad for an agent id he did **not** assign you, and try to use it | Refused, worded so it does not tell you whether that agent exists         |

### 3.2 Using your agent

| #     | Do this                            | Expect                                                                                             |
| ----- | ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| 3.2.1 | Send your agent a prompt           | The reply arrives as it is written, not all at once at the end                                     |
| 3.2.2 | Cancel a running prompt            | The prompt stops. **The agent is not locked down** — send another to prove it                      |
| 3.2.3 | Send a prompt with a file attached | Recorded by hash, type and size. **Open the ledger and confirm the file's contents are not in it** |
| 3.2.4 | Send many prompts quickly          | You are bounded. The message says so rather than silently dropping them                            |
| 3.2.5 | Read the transcript back           | Your prompt is recorded against **your** account                                                   |

### 3.3 Stopping your own agent

| #     | Do this                                  | Expect                                |
| ----- | ---------------------------------------- | ------------------------------------- |
| 3.3.1 | Stop your assigned agent                 | Works, and reports whether it stopped |
| 3.3.2 | Try to stop an agent not assigned to you | Refused                               |
| 3.3.3 | Release your agent                       | Works                                 |

### 3.4 Policy, read and write

| #     | Do this                                   | Expect                                                                                      |
| ----- | ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| 3.4.1 | Read the Policy section                   | You can see every rule, including core ones                                                 |
| 3.4.2 | Add a rule **without** naming an agent    | Refused — a global rule is Administrator's. The message must say to name one of your agents |
| 3.4.3 | Add a rule naming your own agent          | Accepted                                                                                    |
| 3.4.4 | Add a rule naming somebody else's agent   | Refused                                                                                     |
| 3.4.5 | Remove a rule you wrote                   | Works                                                                                       |
| 3.4.6 | Remove a **core** rule                    | No Remove button at all                                                                     |
| 3.4.7 | Look for the installation posture control | Read-only for you                                                                           |

### 3.5 Rule requests

| #     | Do this                              | Expect                                                                                      |
| ----- | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| 3.5.1 | Submit a request naming your agent   | Appears as pending                                                                          |
| 3.5.2 | Submit one with the agent left blank | Accepted as a request for a global rule — the form must say that is what you are asking for |
| 3.5.3 | Submit six                           | Capped, with the limit stated                                                               |
| 3.5.4 | Watch Mohammad approve one           | The rule appears in your policy view                                                        |

### 3.6 The audit ledger

| #     | Do this                          | Expect                              |
| ----- | -------------------------------- | ----------------------------------- |
| 3.6.1 | Open the ledger                  | You see entries for your own agents |
| 3.6.2 | Filter to **Agent actions**      | Only agent entries                  |
| 3.6.3 | Filter to **Policy changes**     | Only administrative ones            |
| 3.6.4 | Press **Verify chain integrity** | Reports intact, with a count        |

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

| #   | Do this                                    | Expect                                                                                                        |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 4.1 | Sign in as the Viewer                      | Identity says `viewer`                                                                                        |
| 4.2 | Count the controls on the whole page       | There should be **no button that changes anything**                                                           |
| 4.3 | Read the ledger                            | Visible, but **resource details are masked** — confirm you cannot read the file paths and commands a User can |
| 4.4 | Read the model's stated intent on an entry | You get a placeholder, not the text                                                                           |
| 4.5 | Try to stop an agent                       | No control, and the route refuses                                                                             |
| 4.6 | Try to submit a rule request               | Refused — proposing is the User tier                                                                          |
| 4.7 | Verify the chain                           | Allowed. Oversight is the point of the tier                                                                   |

---

## 5. Together — the things one person cannot test alone

Do these with all three of you signed in at once.

| #   | Do this                                                             | Expect                                                                                          |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 5.1 | Mohammad stops Malek's agent while Malek is prompting it            | Malek sees it stop, **with a reason**, not a hang                                               |
| 5.2 | Kinan changes Mohammad's password mid-session                       | Mohammad's next action fails as a lost session and returns him to sign-in, not to a broken page |
| 5.3 | Kinan withholds Malek's authoring while Malek has a half-typed rule | Malek's next attempt is refused; check whether the page told him why                            |
| 5.4 | Kinan deletes Mohammad's account while he is signed in              | Mohammad is signed out. Malek's agent must still have an owner — check who                      |
| 5.5 | All three act at once, then Kinan reads the ledger                  | Every one of the three appears, **each with the tier they held at the time**                    |
| 5.6 | Kinan verifies the chain after all of it                            | Intact                                                                                          |

---

## 6. When you are done

1. **Collect the screenshots.** Every refusal you photographed is Chapter 4
   evidence.
2. **List every row where the outcome was invisible.** Not wrong — _invisible_.
   Those are the findings, and they are the ones no test can produce.
3. **List every refusal that did not say what to do instead.** Same.
4. Kinan records the findings in `GOVERNANCE.md`'s register with the next
   numbers, and the narrative in `mg/SESSION-LOG-2026-09.md`.

**A note on what "passing" means here.** Ninety-five of these rows going the
right way is not the result. The result is the handful that do not, because
every finding this project has recorded from operating the system rather than
reading it has been one no amount of reading would have produced: the VPS trip
found three, and one hour of Kinan using the dashboard found two, then nine
more.
