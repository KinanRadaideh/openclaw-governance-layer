# T47: every row, with its status

Updated 2026-11-26 from `T47-TEST-PLAN.md` and the results files (§4 Viewer and §5 Together
added from `T47-RESULTS-VIEWER.md` and `T47-RESULTS-TOGETHER.md`, both run 2026-11-24). The plan
has the full wording and what to expect; this is the index. Rows marked recorded or done are in
the results files; **to do** means nothing is recorded yet.

**283 rows: 155 recorded or done, 128 to do.**

### 1.1 Identity and the page itself

| #     | Who             | Do this                              | Status                  |
| ----- | --------------- | ------------------------------------ | ----------------------- |
| 1.1.1 | sign in as Root | Open the dashboard before signing in | done (Kinan, Root file) |
| 1.1.2 | sign in as Root | Sign in with the wrong password      | done (Kinan, Root file) |
| 1.1.3 | sign in as Root | Get the password wrong five times    | done (Kinan, Root file) |
| 1.1.4 | sign in as Root | Sign in correctly                    | done (Kinan, Root file) |
| 1.1.5 | sign in as Root | Read the section list on the left    | done (Kinan, Root file) |
| 1.1.6 | sign in as Root | Sign out, then press Back            | done (Kinan, Root file) |

### 1.2 Accounts

| #      | Who             | Do this                                                                               | Status                  |
| ------ | --------------- | ------------------------------------------------------------------------------------- | ----------------------- |
| 1.2.1  | sign in as Root | Create an Administrator for Mohammad                                                  | done (Kinan, Root file) |
| 1.2.2  | sign in as Root | Look for a way to create a second Root                                                | done (Kinan, Root file) |
| 1.2.3  | sign in as Root | Create a User with no Administrator chosen                                            | done (Kinan, Root file) |
| 1.2.4  | sign in as Root | Create a User and pick Mohammad as its Administrator                                  | done (Kinan, Root file) |
| 1.2.5  | sign in as Root | Change that User to Viewer                                                            | done (Kinan, Root file) |
| 1.2.6  | sign in as Root | Try to change your own Root row's role                                                | done (Kinan, Root file) |
| 1.2.7  | sign in as Root | Set a new password on Mohammad's account                                              | done (Kinan, Root file) |
| 1.2.8  | sign in as Root | Set your own password, sign out, sign back in with the new one                        | done (Kinan, Root file) |
| 1.2.9  | sign in as Root | Try to delete your own Root account                                                   | done (Kinan, Root file) |
| 1.2.10 | sign in as Root | Delete a spare account you created for this                                           | done (Kinan, Root file) |
| 1.2.11 | sign in as Root | With your signed-in session, call GET /control-ui/governance/users with curl          | done (Kinan, Root file) |
| 1.2.12 | sign in as Root | Ask Mohammad to make the same call with his session                                   | done (Kinan, Root file) |
| 1.2.13 | sign in as Root | Create an agent and pick yourself as its owner                                        | done (Kinan, Root file) |
| 1.2.14 | sign in as Root | Ask Mohammad to assign that Root-owned agent to Malek                                 | done (Kinan, Root file) |
| 1.2.15 | sign in as Root | Check the picker that asks who a User answers to                                      | done (Kinan, Root file) |
| 1.2.16 | sign in as Root | Sign out, then sign back in in the same browser tab                                   | done (Kinan, Root file) |
| 1.2.17 | sign in as Root | Look on an agent's row for a way to rename it, or to give it to another Administrator | done (Kinan, Root file) |

### 1.3 Withholding policy authoring (T27)

| #     | Who             | Do this                                          | Status                  |
| ----- | --------------- | ------------------------------------------------ | ----------------------- |
| 1.3.1 | sign in as Root | On Malek's User row, press Withhold rule editing | done (Kinan, Root file) |
| 1.3.2 | sign in as Root | Ask Malek to look at Policy                      | done (Kinan, Root file) |
| 1.3.3 | sign in as Root | Ask Malek what is now missing                    | done (Kinan, Root file) |
| 1.3.4 | sign in as Root | Ask Malek to stop his agent                      | done (Kinan, Root file) |
| 1.3.5 | sign in as Root | Ask Malek to submit a rule request               | done (Kinan, Root file) |
| 1.3.6 | sign in as Root | Grant it back                                    | done (Kinan, Root file) |

### 1.4 The shipped rules, and the split core tier (T24)

| #     | Who             | Do this                                     | Status                  |
| ----- | --------------- | ------------------------------------------- | ----------------------- |
| 1.4.1 | sign in as Root | Read the Policy section's rule list         | done (Kinan, Root file) |
| 1.4.2 | sign in as Root | Find a core denial with a Switch off button | done (Kinan, Root file) |
| 1.4.3 | sign in as Root | Find one without it                         | done (Kinan, Root file) |
| 1.4.4 | sign in as Root | Read the row above the list explaining why  | done (Kinan, Root file) |
| 1.4.5 | sign in as Root | Switch off the privilege-escalation denial  | done (Kinan, Root file) |
| 1.4.6 | sign in as Root | Open Deployment and network posture         | done (Kinan, Root file) |
| 1.4.7 | sign in as Root | Press Switch on beside that rule            | done (Kinan, Root file) |

### 1.5 Policy settings above the User tier

| #     | Who             | Do this                                         | Status                  |
| ----- | --------------- | ----------------------------------------------- | ----------------------- |
| 1.5.1 | sign in as Root | Set the escalation timeout to 30 seconds        | done (Kinan, Root file) |
| 1.5.2 | sign in as Root | Set it to 2 seconds                             | done (Kinan, Root file) |
| 1.5.3 | sign in as Root | Set a per-account ask override for Malek        | done (Kinan, Root file) |
| 1.5.4 | sign in as Root | Set one for an account name that does not exist | done (Kinan, Root file) |
| 1.5.5 | sign in as Root | Clear the override                              | done (Kinan, Root file) |

### 1.6 The Codex backend

| #     | Who             | Do this                                | Status                  |
| ----- | --------------- | -------------------------------------- | ----------------------- |
| 1.6.1 | sign in as Root | Read the row before touching it        | done (Kinan, Root file) |
| 1.6.2 | sign in as Root | Open Why this is off by default        | done (Kinan, Root file) |
| 1.6.3 | sign in as Root | Turn it on                             | done (Kinan, Root file) |
| 1.6.4 | sign in as Root | Cancel the dialog                      | done (Kinan, Root file) |
| 1.6.5 | sign in as Root | Turn it on for real                    | done (Kinan, Root file) |
| 1.6.6 | sign in as Root | Look at a path denial in the rule list | done (Kinan, Root file) |
| 1.6.7 | sign in as Root | Turn it off                            | done (Kinan, Root file) |

### 1.7 The deployment report

| #     | Who             | Do this                                     | Status                  |
| ----- | --------------- | ------------------------------------------- | ----------------------- |
| 1.7.1 | sign in as Root | Open Deployment and network posture         | done (Kinan, Root file) |
| 1.7.2 | sign in as Root | Read the failing rows                       | done (Kinan, Root file) |
| 1.7.3 | sign in as Root | chmod 644 the ledger key on the VPS, reload | done (Kinan, Root file) |
| 1.7.4 | sign in as Root | chmod 600 it back                           | done (Kinan, Root file) |

### 1.8 The organisation (do this LAST — it is irreversible)

| #     | Who             | Do this                             | Status |
| ----- | --------------- | ----------------------------------- | ------ |
| 1.8.1 | sign in as Root | Open the Organisation panel         | to do  |
| 1.8.2 | sign in as Root | Type the wrong username to confirm  | to do  |
| 1.8.3 | sign in as Root | Type your Root username and confirm | to do  |
| 1.8.4 | sign in as Root | Check the audit ledger file on disk | to do  |
| 1.8.5 | sign in as Root | Verify the chain                    | to do  |

### 2.1 What you must not see

| #     | Who                      | Do this                                                                              | Status         |
| ----- | ------------------------ | ------------------------------------------------------------------------------------ | -------------- |
| 2.1.1 | sign in as Administrator | Look for an Accounts section                                                         | recorded: Pass |
| 2.1.2 | sign in as Administrator | Look for the Organisation panel                                                      | recorded: Pass |
| 2.1.3 | sign in as Administrator | Look for Deployment and network posture                                              | recorded: Pass |
| 2.1.4 | sign in as Administrator | Look for a Switch off button on a core rule                                          | recorded: Pass |
| 2.1.5 | sign in as Administrator | Ask Kinan for the API path of one of those, and call it with curl using your session | recorded: Pass |

### 2.2 The agent registry

| #      | Who                      | Do this                                                                                          | Status                                             |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| 2.2.1  | sign in as Administrator | Open Agents in your organisation on a fresh install                                              | deferred: needs a fresh install (after Root 1.8)   |
| 2.2.2  | sign in as Administrator | Create an agent, leaving the owner blank                                                         | recorded: Pass (adapted)                           |
| 2.2.3  | sign in as Administrator | Create an agent with yourself as owner                                                           | recorded: Pass                                     |
| 2.2.4  | sign in as Administrator | Create a second agent with the same id                                                           | recorded: Pass                                     |
| 2.2.5  | sign in as Administrator | Create one with the id typed in different case                                                   | recorded: Pass                                     |
| 2.2.6  | sign in as Administrator | Register an agent OpenClaw already has                                                           | recorded: Pass                                     |
| 2.2.7  | sign in as Administrator | Press Remove on an agent                                                                         | recorded: Pass                                     |
| 2.2.8  | sign in as Administrator | Choose "unregister"                                                                              | recorded: Pass (full, see 2.2.8b and 2.2.8c)       |
| 2.2.9  | sign in as Administrator | Choose "delete" on another that has a rule and a posture override                                | recorded: Pass                                     |
| 2.2.10 | sign in as Administrator | Create an agent with a distinctive name, then ask it _"what is your name?"_                      | recorded: Pass                                     |
| 2.2.11 | sign in as Administrator | Read the third and fourth boxes on the create form                                               | recorded: Pass                                     |
| 2.2.12 | sign in as Administrator | After 2.2.9, create an agent with the same name                                                  | recorded: Pass, with a defect found                |
| 2.2.13 | sign in as Administrator | Put a file in an agent's working folder, then Delete the agent… and Delete the way OpenClaw does | recorded: Pass                                     |
| 2.2.14 | sign in as Administrator | Start a long task on an agent and, while it runs, choose Delete the way OpenClaw does            | recorded: Pass on wording; visibility defect found |
| 2.2.15 | sign in as Administrator | Press Delete the agent…, then Keep this agent                                                    | recorded: Pass (stale created-notice, build 9e406… |

### 2.3 Assigning agents to people

| #     | Who                      | Do this                                | Status                                 |
| ----- | ------------------------ | -------------------------------------- | -------------------------------------- |
| 2.3.1 | sign in as Administrator | Assign your agent to Malek             | recorded: Pass                         |
| 2.3.2 | sign in as Administrator | Assign an agent id that does not exist | recorded: Pass                         |
| 2.3.3 | sign in as Administrator | Type the id in different case          | recorded: Pass (input case to confirm) |

### 2.4 Policy

| #     | Who                      | Do this                                                     | Status                                                       |
| ----- | ------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------ |
| 2.4.1 | sign in as Administrator | Add an allow rule for ^ls( .*)?$ binding every agent        | recorded: Pass                                               |
| 2.4.2 | sign in as Administrator | Add the same rule again                                     | recorded: Pass (two-step; plan wording out of dat…           |
| 2.4.3 | sign in as Administrator | Add a rule with a broken regular expression                 | recorded: Pass                                               |
| 2.4.4 | sign in as Administrator | Add a rule with a pattern designed to be slow, e.g. ^(a+)+$ | recorded: Pass                                               |
| 2.4.5 | sign in as Administrator | Add a rule with a 5-minute lifetime                         | recorded: Pass (plan wording out of date)                    |
| 2.4.6 | sign in as Administrator | Press Who does this affect? on a global rule                | done: was FAIL, fixed, VPS retest passed 2026-11-24 (2.4.6b) |
| 2.4.7 | sign in as Administrator | Use Allow a folder, except… with one exception              | recorded: Pass                                               |
| 2.4.8 | sign in as Administrator | Remove one of the two                                       | recorded: Pass                                               |
| 2.4.9 | sign in as Administrator | Filter the rule list to a term matching nothing             | recorded: Pass                                               |

### 2.5 Per-agent posture

| #     | Who                      | Do this                                                                                               | Status                                    |
| ----- | ------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 2.5.1 | sign in as Administrator | Set one agent to Monitor                                                                              | recorded: Pass                            |
| 2.5.2 | sign in as Administrator | Have Malek look for the same control                                                                  | recorded: Pass                            |
| 2.5.3 | sign in as Administrator | Press Use default                                                                                     | recorded: Pass (from screenshot)          |
| 2.5.4 | sign in as Administrator | Set a per-agent escalation timeout                                                                    | recorded: Pass                            |
| 2.5.5 | sign in as Administrator | Under Escalation for one agent, press Ask a human before picking an agent, then pick one and press it | recorded: Pass                            |
| 2.5.6 | sign in as Administrator | Have Malek look for the same control                                                                  | recorded: Pass (from earlier screenshots) |

### 2.6 The emergency kill switch

| #     | Who                      | Do this                                      | Status                                                    |
| ----- | ------------------------ | -------------------------------------------- | --------------------------------------------------------- |
| 2.6.1 | sign in as Administrator | Have Malek start a long prompt on his agent  | done: was partial, VPS retest passed 2026-11-24 (2.6.1j)  |
| 2.6.2 | sign in as Administrator | Press Lock down on that agent                | was FAIL; fixed, passed twice 2026-11-23 (2.6.2e, 2.6.2g) |
| 2.6.3 | sign in as Administrator | Ask Malek what he saw                        | was FAIL; fixed, passed 2026-11-23 (2.6.3b)               |
| 2.6.4 | sign in as Administrator | Try any tool call on that agent              | done: VPS retest passed 2026-11-24 (2.6.4b)               |
| 2.6.5 | sign in as Administrator | Stop an agent using the id in different case | done: VPS retest passed 2026-11-24 (2.6.5c)               |
| 2.6.6 | sign in as Administrator | Release the lockdown                         | recorded: Pass on the release; agent-works-again…         |
| 2.6.7 | sign in as Administrator | Stop an agent id that does not exist         | done: VPS retest passed 2026-11-24 (2.6.7b)               |

### 2.7 Rule requests

| #      | Who                      | Do this                                                                                                                             | Status                                             |
| ------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 2.7.1  | sign in as Administrator | Look at Malek's pending request                                                                                                     | recorded: Pass                                     |
| 2.7.2  | sign in as Administrator | Approve it                                                                                                                          | recorded: Pass (request-queue side not yet checke… |
| 2.7.3  | sign in as Administrator | Try to decide the same request again                                                                                                | recorded: Pass (page side)                         |
| 2.7.4  | sign in as Administrator | Reject another                                                                                                                      | recorded: Pass                                     |
| 2.7.5  | sign in as Administrator | Get an agent to trigger an escalation, and answer it Always allow                                                                   | recorded: Pass                                     |
| 2.7.6  | sign in as Administrator | Read that request before approving it                                                                                               | recorded: Pass                                     |
| 2.7.7  | sign in as Administrator | Approve it, then read the ledger                                                                                                    | recorded: Pass (plan wording out of date)          |
| 2.7.8  | sign in as Administrator | Trigger the same escalation again and answer Always allow twice                                                                     | recorded: Pass                                     |
| 2.7.9  | sign in as Administrator | Make the agent trigger an escalation by reading a file, answer Always allow, approve it, then ask the agent to write that same file | recorded: Pass (second attempt; see 2.7.9c)        |
| 2.7.10 | sign in as Administrator | With that read grant approved, get the agent to escalate a write to the same file and answer Always allow                           | done: VPS retest passed 2026-11-24 (2.7.10b)       |
| 2.7.11 | sign in as Administrator | Nothing to press: read §6b's note on a full queue                                                                                   | recorded: Done (read)                              |

### 3.1 What you see

| #     | Who             | Do this                                                                       | Status         |
| ----- | --------------- | ----------------------------------------------------------------------------- | -------------- |
| 3.1.1 | sign in as User | Sign in                                                                       | recorded: Pass |
| 3.1.2 | sign in as User | Count your sections                                                           | recorded: Pass |
| 3.1.3 | sign in as User | Look at Your agents                                                           | recorded: Pass |
| 3.1.4 | sign in as User | Ask Mohammad for an agent id he did not assign you, and try to use it         | recorded: Pass |
| 3.1.5 | sign in as User | Read the agent rows in Your agents                                            | recorded: Pass |
| 3.1.6 | sign in as User | Two people. Ask Mohammad to assign you another agent while you stay signed in | recorded: Pass |
| 3.1.7 | sign in as User | Two people. Ask Mohammad to take one away while you stay signed in            | recorded: Pass |

### 3.2 Using your agent

| #      | Who             | Do this                                                                                                 | Status                                         |
| ------ | --------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 3.2.1  | sign in as User | Send your agent a prompt                                                                                | recorded: Pass                                 |
| 3.2.2  | sign in as User | Cancel a running prompt                                                                                 | recorded: FAIL (cancel ignored once streaming) |
| 3.2.3  | sign in as User | Send a prompt with a file attached                                                                      | to do                                          |
| 3.2.4  | sign in as User | Start three long prompts at once                                                                        | to do                                          |
| 3.2.5  | sign in as User | Read the transcript back                                                                                | recorded: Pass                                 |
| 3.2.6  | sign in as User | Type a message and watch the Send button                                                                | recorded: Pass                                 |
| 3.2.7  | sign in as User | Pick your agent from the list, then press Talk                                                          | recorded: Pass                                 |
| 3.2.8  | sign in as User | Ask the agent for something your policy refuses (~/.npmrc)                                              | to do                                          |
| 3.2.9  | sign in as User | Send a message and watch the panel while it is answering                                                | recorded: Pass                                 |
| 3.2.10 | sign in as User | With several agents assigned, open the first one                                                        | to do                                          |
| 3.2.11 | sign in as User | Look at the width of the message box                                                                    | recorded: Pass                                 |
| 3.2.12 | sign in as User | Send a prompt that will take a while, then reload the page before it finishes and reopen the same agent | to do                                          |
| 3.2.13 | sign in as User | Press Cancel on that recovered task, from _Active agent sessions_ this time                             | to do                                          |
| 3.2.14 | sign in as User | While a task is running in this tab, try to open a different agent's conversation                       | to do                                          |

### 3.3 Stopping your own agent

| #     | Who             | Do this                                  | Status |
| ----- | --------------- | ---------------------------------------- | ------ |
| 3.3.1 | sign in as User | Stop your assigned agent                 | to do  |
| 3.3.2 | sign in as User | Try to stop an agent not assigned to you | to do  |
| 3.3.3 | sign in as User | Release your agent                       | to do  |

### 3.4 Policy, read and write

| #     | Who             | Do this                                   | Status |
| ----- | --------------- | ----------------------------------------- | ------ |
| 3.4.1 | sign in as User | Read the Policy section                   | to do  |
| 3.4.2 | sign in as User | Add a rule without naming an agent        | to do  |
| 3.4.3 | sign in as User | Add a rule naming your own agent          | to do  |
| 3.4.4 | sign in as User | Add a rule naming somebody else's agent   | to do  |
| 3.4.5 | sign in as User | Remove a rule you wrote                   | to do  |
| 3.4.6 | sign in as User | Look at a core rule and a global rule     | to do  |
| 3.4.7 | sign in as User | Look for the installation posture control | to do  |

### 3.5 Rule requests

| #     | Who             | Do this                                                     | Status |
| ----- | --------------- | ----------------------------------------------------------- | ------ |
| 3.5.1 | sign in as User | Submit a request naming your agent                          | to do  |
| 3.5.2 | sign in as User | Submit one with the agent left blank                        | to do  |
| 3.5.3 | sign in as User | With twenty of your requests waiting, submit a twenty-first | to do  |
| 3.5.4 | sign in as User | Watch Mohammad approve one                                  | to do  |

### 3.6 The audit ledger

| #     | Who             | Do this                      | Status |
| ----- | --------------- | ---------------------------- | ------ |
| 3.6.1 | sign in as User | Open the ledger              | to do  |
| 3.6.2 | sign in as User | Filter to Agent actions      | to do  |
| 3.6.3 | sign in as User | Filter to Policy changes     | to do  |
| 3.6.4 | sign in as User | Press Verify chain integrity | to do  |

### 3.7 The refusals (record the exact wording of each)

| #     | Who             | Do this                                | Status |
| ----- | --------------- | -------------------------------------- | ------ |
| 3.7.1 | sign in as User | Try to create an account               | to do  |
| 3.7.2 | sign in as User | Try to switch off a core rule          | to do  |
| 3.7.3 | sign in as User | Try to change another person's account | to do  |
| 3.7.4 | sign in as User | Try to set the installation posture    | to do  |
| 3.7.5 | sign in as User | Try to read the deployment report      | to do  |

## 4. Viewer — Malek's second account

| #   | Who               | Do this                                    | Status                                                       |
| --- | ----------------- | ------------------------------------------ | ------------------------------------------------------------ |
| 4.1 | sign in as Viewer | Sign in as the Viewer                      | recorded: Pass                                               |
| 4.2 | sign in as Viewer | Count the controls on the whole page       | recorded: Pass                                               |
| 4.3 | sign in as Viewer | Read the ledger                            | recorded: Pass (4.3b, after an agent was assigned)           |
| 4.4 | sign in as Viewer | Read the model's stated intent on an entry | recorded: Pass (#323; Admin-vs-Viewer on one entry not done) |
| 4.5 | sign in as Viewer | Try to stop an agent                       | recorded: Pass (page and route, 4.5b)                        |
| 4.6 | sign in as Viewer | Look for a way to submit a request         | recorded: Pass (route, page 4.6b)                            |
| 4.7 | sign in as Viewer | Verify the chain                           | recorded: Pass (head matched the script, 4.7c)               |
| 4.8 | sign in as Viewer | Read the Rule requests queue               | recorded: Pass (4.8b)                                        |

## 5. Together — the things one person cannot test alone

| #   | Who          | Do this                                                                                                                                                | Status                                               |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 5.1 | all together | Mohammad stops Malek's agent while Malek is prompting it                                                                                               | recorded: Pass (re-prompt after release not checked) |
| 5.2 | all together | Kinan changes Mohammad's password mid-session                                                                                                          | recorded: Pass                                       |
| 5.3 | all together | Kinan withholds Malek's authoring while Malek has a half-typed rule                                                                                    | recorded: Pass (5.3b, 5.3c)                          |
| 5.4 | all together | Kinan deletes Mohammad's account while he is signed in                                                                                                 | recorded: Pass                                       |
| 5.5 | all together | All three act at once, then Kinan reads the ledger                                                                                                     | recorded: Pass                                       |
| 5.6 | all together | Kinan verifies the chain after all of it                                                                                                               | recorded: Pass (both chains matched the script)      |
| 5.7 | all together | Kinan creates a second Administrator account for this row, and whoever signs in with it looks at the row for Mohammad's agent in _Agents in your orga… | recorded: Pass                                       |
| 5.8 | all together | Mohammad, then Kinan, look at the same row                                                                                                             | recorded: Pass                                       |

## 6. Rows from the lifecycle and bounds sweeps (2026-09-05)

| #   | Who              | Do this                                                                                                                                                | Status |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 6.1 | Kinan + Malek    | Malek sends the agent a prompt with something recognisable in it ("the Ahmad matter"). Kinan sets Malek's escalation override to off, then deletes Ma… | to do  |
| 6.2 | Kinan            | Before deleting an account that has a transcript, note the number of turns. After deleting, search the audit ledger for the deleted account's name.    | to do  |
| 6.3 | Kinan            | Read the ledger entry for the deletion itself.                                                                                                         | to do  |
| 6.4 | Malek + Mohammad | Malek's agent triggers three or four distinct unanswered escalations (vary the path each time), and Mohammad's agent triggers one.                     | to do  |

## 6b. Rows from T60 and T63 (built 2026-09-11)

| #    | Who                      | Do this                                                                                                          | Status |
| ---- | ------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------ |
| 6b.1 | Anyone with an agent     | Get the agent to attempt something no rule covers, with escalation on, so an approval card appears               | to do  |
| 6b.2 | Same                     | Press Always allow                                                                                               | to do  |
| 6b.3 | Kinan + Mohammad         | Mohammad approves that request in Rule requests; the agent attempts the same action again                        | to do  |
| 6b.4 | Kinan                    | With one escalation timed out into Awaiting your decision, press Would allow                                     | to do  |
| 6b.5 | Two people, two browsers | Malek starts a long task; Kinan cancels it from _Active agent sessions_ while Malek watches his own conversation | to do  |

## 6c. Rows from the dashboard QA pass (2026-09-12 and 13)

| #     | Who                                                                             | Do this                                                                                                                          | Status |
| ----- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 6c.1  | Anyone with an agent, on the governance page                                    | From _Your agents_, ask the agent to do something no rule covers, with escalation on                                             | to do  |
| 6c.2  | Same                                                                            | Ask again, and leave the card unanswered                                                                                         | to do  |
| 6c.3  | Anyone                                                                          | Press Remove on a rule, or any button that asks "Are you sure?", then press Escape                                               | to do  |
| 6c.4  | Kinan                                                                           | Sign in, open every section, sign out. Then open the browser's developer tools → Application → Cache Storage                     | to do  |
| 6c.5  | Kinan                                                                           | While signed in, stop the Gateway for a minute, then start it again                                                              | to do  |
| 6c.6  | Anyone with an agent                                                            | As row 3.2.12, but close the tab instead of reloading, then open the dashboard again                                             | to do  |
| 6c.7  | Kinan                                                                           | Engage the kill switch on an agent, then Release it                                                                              | to do  |
| 6c.8  | Kinan + a User                                                                  | With the User's conversation with an agent open, unassign that agent from them in _Accounts_                                     | to do  |
| 6c.9  | A User                                                                          | In _Rule requests_, paste a reason longer than 500 characters and submit                                                         | to do  |
| 6c.10 | A User with an agent, an Administrator, and a Viewer, each on their own machine | The User asks the agent for something no rule covers                                                                             | to do  |
| 6c.11 | A User with an agent                                                            | Ask for something no rule covers, and while its card is up press Cancel on the task in the conversation                          | to do  |
| 6c.12 | Kinan + a User with an agent                                                    | The User asks for something no rule covers. While the card is up on the User's screen, change the User to a Viewer in _Accounts_ | to do  |
| 6c.13 | Kinan + a User with an agent                                                    | The User asks for something no rule covers. While its card is up, Kinan engages the kill switch on that agent                    | to do  |

## 6d. Rows from the work after the push (2026-09-13 and 14)

| #     | Who                   | Do this                                                                                                                                                | Status |
| ----- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 6d.1  | Mohammad              | Add an allow rule for one agent with a 60-minute lifetime, then add the identical rule with no lifetime                                                | to do  |
| 6d.2  | Mohammad              | Use Allow a folder, except… for src with no exceptions                                                                                                 | to do  |
| 6d.3  | Malek, then Mohammad  | Malek requests a command rule with the pattern ls (no anchors) for his agent. Mohammad reads the pending row                                           | to do  |
| 6d.4  | Malek, then Mohammad  | Mohammad adds a temporary rule ^pwd$ for Malek's agent. Malek requests the same pattern for the same agent. Mohammad reads the pending row             | to do  |
| 6d.5  | Malek, then Mohammad  | In _Rule requests_, Request a change for one agent: your agent, posture, Monitor, a reason. Mohammad approves it                                       | to do  |
| 6d.6  | Malek                 | Open the value list for a posture in that form                                                                                                         | to do  |
| 6d.7  | Malek                 | With curl and your session, POST /control-ui/governance/rule-requests with { "agentId": "<yours>", "setting": "mode", "value": "off", "reason": "test… | to do  |
| 6d.8  | Malek, then Mohammad  | Request a path rule, choose read only in the new _Read or write_ box, and submit. Mohammad reads the row and approves                                  | to do  |
| 6d.9  | A User with no agents | Look at _Rule requests_                                                                                                                                | to do  |
| 6d.10 | Kinan                 | Press Lock down in the kill switch                                                                                                                     | to do  |
| 6d.11 | Malek, then Mohammad  | Malek requests a path rule for his agent. Mohammad removes that agent with delete (not unregister), then reads _Rule requests_                         | to do  |
| 6d.12 | Kinan, then Mohammad  | Kinan switches off the privilege-escalation denial. Mohammad opens Policy                                                                              | to do  |
| 6d.13 | Malek                 | Start a task on your agent, then open _Active agent sessions_ while it runs                                                                            | to do  |
| 6d.14 | Malek, then Mohammad  | After 6d.11, Mohammad registers a new agent under the deleted agent's name, then reads _Rule requests_ again                                           | to do  |
| 6d.15 | Malek, then Mohammad  | Malek prompts his agent into an escalation and leaves the card waiting. Mohammad deletes the agent and registers a new one under the same name within… | to do  |
| 6d.16 | Mohammad              | With a question waiting in _Awaiting your decision_ for an agent, delete that agent, register a new one under the same name, then press Allow on the…  | to do  |

## 6e. Rows from the live check of 2026-09-19

| #    | Who                            | Do this                                                                                                                                                | Status |
| ---- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 6e.1 | Kinan, at the VPS's terminal   | Let an escalation lapse unanswered, then read the Gateway log (journalctl --user -u openclaw-gateway or the log file)                                  | to do  |
| 6e.2 | Malek, as the Viewer           | Read What this account can do in Identity, then Rule requests                                                                                          | to do  |
| 6e.3 | Mohammad                       | In Request a change for one agent, open the agent list, on an installation where OpenClaw has an agent governance never registered (main, if nobody r… | to do  |
| 6e.4 | Malek, then Mohammad           | Malek gets his agent to attempt something no rule covers and presses Always allow on the card; Mohammad opens _Rule requests_                          | to do  |
| 6e.5 | Mohammad                       | On his own agent's row press Edit…, change the display name, Save name                                                                                 | to do  |
| 6e.6 | Kinan, with Mohammad and Malek | Edit… on Mohammad's agent, choose a new owner, Change owner                                                                                            | to do  |

## 6f. Rows from T70: every rule says why it exists (2026-09-27)

| #    | Who                                | Do this                                                                                                                                              | Status |
| ---- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 6f.1 | Malek, as the User                 | In Add a rule, fill the pattern and your agent, leave Rule description (required) empty, then type only spaces, then a real sentence; press Add rule | to do  |
| 6f.2 | Mohammad                           | Add a global rule (agent left blank) with a description, then Allow a folder with one exception, filling Why this folder is allowed (required)       | to do  |
| 6f.3 | Mohammad                           | Reload the page. Type a few words of a description into Find a rule; then words from a shipped rule, e.g. _privilege escalation_                     | to do  |
| 6f.4 | Mohammad                           | Audit ledger → Policy changes; then remove the global rule and look again; then Verify chain integrity                                               | to do  |
| 6f.5 | Malek's second account, the Viewer | Open Policy                                                                                                                                          | to do  |
| 6f.6 | Kinan, with curl                   | POST policy/rules with no description, with " ", and with 501 characters                                                                             | to do  |

## 6g. Rows from the QAs of 2026-09-27 to 2026-10-09 (findings 381–421, T73, T76, T78, decisions (ii) and C, T75)

| #     | Who                       | Do this                                                                                                                          | Status                                    |
| ----- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 6g.1  | Kinan, as Root            | Demote, then try to delete, an Administrator who still owns an agent                                                             | to do                                     |
| 6g.2  | Kinan                     | On a User row, use Administrator this account answers to to move it to an Administrator who does not own an agent the User holds | to do                                     |
| 6g.3  | Mohammad                  | Start Create agent (it takes up to a minute), and while it runs press Lock down on another agent                                 | to do                                     |
| 6g.4  | Malek                     | Ask the default agent (main) to read a file inside another agent's folder (<agent>/notes.txt)                                    | to do                                     |
| 6g.5  | The folder agent's owner  | Answer the same question                                                                                                         | to do                                     |
| 6g.6  | Two operators at once     | Both answer one escalation, second one after the first                                                                           | to do                                     |
| 6g.7  | Kinan                     | Set the posture to Monitor, read the deployment report; then back to Enforce. Then, with curl, POST policy/mode with off         | to do                                     |
| 6g.8  | Kinan, then Mohammad      | Sign out as Root and sign in as Mohammad in the same tab                                                                         | to do                                     |
| 6g.9  | A second Administrator    | Try to assign one of your agents to a User who answers to Mohammad                                                               | to do                                     |
| 6g.10 | Mohammad                  | Add a rule for zetta when the agent is zeta                                                                                      | to do                                     |
| 6g.11 | Kinan, as Root            | Register an unregistered host agent, choosing Mohammad in the owner picker                                                       | to do                                     |
| 6g.12 | Mohammad, then Malek      | Mohammad cancels a task Malek started, from Active agent sessions                                                                | to do                                     |
| 6g.13 | Mohammad                  | Reject a rule request with a note                                                                                                | to do                                     |
| 6g.14 | Malek                     | Lock your agent down, then send it a prompt                                                                                      | to do                                     |
| 6g.15 | Kinan                     | Fail Malek's sign-in five times, then set him a new password                                                                     | to do                                     |
| 6g.16 | Kinan, as Root            | Delete an agent whose folder is inside main's workspace (one created from the dashboard); choose trash, then on another, keep    | to do                                     |
| 6g.17 | Kinan, on the server      | Cut the last lines off the active ledger file (head -n -3), then use the dashboard as anyone                                     | to do                                     |
| 6g.18 | Mohammad, then Kinan      | Try to acknowledge the alert as Mohammad; then as Kinan, with a reason                                                           | to do                                     |
| 6g.19 | Kinan                     | Delete an account while the session store is unreachable (or follow Claude's fixture steps); then Finish deleting                | to do                                     |
| 6g.20 | Anyone                    | Edit the governance cookie in the browser to garbage, then reload                                                                | to do                                     |
| 6g.21 | Malek, in OpenClaw's chat | Send _"Remember for later: the staging password is hunter2"_                                                                     | to do                                     |
| 6g.22 | Kinan                     | Wait for a heartbeat or a memory dream; read the ledger                                                                          | recorded: Pass (Admin1's view, User file) |
| 6g.23 | Kinan, on the server      | After 6g.21, grep -c hunter2 the day's log in OpenClaw's log folder (/tmp/openclaw/openclaw-<date>.log)                          | to do                                     |

## 6h. Rows from the work of 2026-10-10 to 2026-10-28 (T86, findings 422–450, R1–R3)

| #     | Who                                                                              | Do this                                                                                                                                                | Status |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 6h.1  | Malek, then Kinan at the server                                                  | Ask the agent to start a long command in the background (e.g. sleep 600, told to run it in the background) and confirm with ps aux \/ grep "sleep 600… | to do  |
| 6h.2  | Malek                                                                            | Ask the agent to list a folder outside the project, e.g. ls /etc or ls /root/.ssh; then a folder inside its workspace                                  | to do  |
| 6h.3  | Malek (only if the browser tool works on the VPS)                                | Ask the agent to open https://en.wikipedia.org in the browser, then a site on no list, e.g. https://example.com                                        | to do  |
| 6h.4  | Mohammad                                                                         | Open the posture controls, installation-wide and for one agent                                                                                         | to do  |
| 6h.5  | Malek, then Mohammad                                                             | Malek gets an escalation card, chooses a lifetime under _"If you choose Always allow, ask for a rule that:"_ (e.g. 1 hour), and presses Always allow.… | to do  |
| 6h.6  | Malek                                                                            | Request a change for one agent … and a path or command rule request: set _"How long the rule should last once approved"_                               | to do  |
| 6h.7  | Malek                                                                            | After Always allow on a card, read the notice in the waiting-questions band                                                                            | to do  |
| 6h.8  | Kinan at the server                                                              | Edit ~/.openclaw/governance/groups/<id>/policy.json by hand (add a space and save), then use the dashboard                                             | to do  |
| 6h.9  | Malek, as the User, then as the Viewer                                           | After 6g.7 (a posture change), open the Audit ledger                                                                                                   | to do  |
| 6h.10 | Malek, in OpenClaw's own chat (Control UI), with Mohammad on the governance page | Ask the agent, from the chat rather than the governance page, for something no rule covers                                                             | to do  |
| 6h.11 | Mohammad                                                                         | Add a rule with an unanchored pattern, e.g. echo test for one agent                                                                                    | to do  |
| 6h.12 | Mohammad, then Kinan                                                             | After Add anyway, read the notice under the rule list. Kinan removes that rule from his own browser                                                    | to do  |
| 6h.13 | Mohammad                                                                         | Press Remove on a forbid rule, then on an allow rule                                                                                                   | to do  |
| 6h.14 | Mohammad, with Malek's agent waiting                                             | Switch to another browser tab, then have Malek's agent raise an escalation                                                                             | to do  |
| 6h.15 | Kinan                                                                            | In Create account and in Set password on a row, type a password of 1 to 7 characters                                                                   | to do  |
| 6h.16 | Anyone                                                                           | Use the page with the keyboard only: Enter in a one-line field (add a rule, create an account), a section in the list on the left, any button that re… | to do  |
| 6h.17 | Malek                                                                            | Open a conversation with several earlier messages and send one                                                                                         | to do  |
| 6h.18 | Kinan at the server                                                              | As 6g.21, but with an error and a phrase: have the agent fail a step whose error contains hunter2, and send _"the passphrase is "correct horse batter… | to do  |

### A. Retests of the fixes

| #    | Who                               | Do this                                                                                                                                                | Status                             |
| ---- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| 6i.1 | Mohammad, Malek, Kinan at the VPS | The kill switch during a long reply. In a VPS shell run while true; do echo "$(date +%H:%M:%S) $(curl -s -m 10 -o /dev/null -w '%{http_code} %{time_t… | done twice (2.6.2e, 2.6.2g)        |
| 6i.2 | Mohammad, Malek                   | As 6i.1, but Mohammad presses Lock down within 5 seconds of the prompt                                                                                 | to do                              |
| 6i.3 | Mohammad                          | The sessions panel during a run. Mohammad alone watches Active agent sessions (presses nothing) while Malek's long prompt runs. On the VPS also run t… | done: VPS retest passed 2026-11-24 |
| 6i.4 | Mohammad                          | With nothing pressed, run the /healthz loop of 6i.1 through one long reply, and again through Create agent (35 to 77 s)                                | to do                              |
| 6i.5 | Mohammad                          | Who does this affect? (2.4.6). Add a global rule, then press the button on it, with registered agents that have no rule and are not running            | done: VPS retest passed 2026-11-24 |
| 6i.6 | Malek, then Mohammad              | Read and write are different grants (2.7.10). Approve a read grant for a file (with a lifetime). Have the agent escalate a write of the same file; an… | done: VPS retest passed 2026-11-24 |
| 6i.7 | Mohammad                          | Lock down an unknown id (2.6.7). Type nobody-here in Lock down an agent; read the advice under the box, then press the button                          | done: VPS retest passed 2026-11-24 |
| 6i.8 | Malek (or UserTest)               | The refusal for a locked agent (2.6.4). After Mohammad locks his agent, send it _"say hello"_                                                          | done: VPS retest passed 2026-11-24 |
| 6i.9 | Mohammad                          | Lock down by an id typed in capitals (2.6.5b), e.g. ZEBRA-QUILL                                                                                        | done: VPS retest passed 2026-11-24 |

### C. Defects from the Administrator pass that are not fixed

| #     | Who      | Do this                                                                                               | Status                                           |
| ----- | -------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 6i.10 | Mohammad | Add the same rule twice; read the notice (2.4.2)                                                      | done: VPS retest passed 2026-11-24               |
| 6i.11 | Mohammad | Create test1, Delete the way OpenClaw does, create test1 again, send it any prompt (2.2.14a)          | done: VPS retest passed 2026-11-24               |
| 6i.12 | Mohammad | Create an agent with the name of a deleted agent (2.2.12), at full screen width                       | done: VPS retest passed 2026-11-24               |
| 6i.13 | Mohammad | Scroll down to Your agents, start a task, press Delete the way OpenClaw does while it runs (2.2.14)   | done: VPS retest passed 2026-11-24               |
| 6i.14 | Mohammad | Run a short prompt (_"say hello"_) and watch Active agent sessions when the reply arrives (2.6.1g)    | done: passed, delay not timed (2.6.1k)           |
| 6i.15 | Mohammad | Lock down an agent a moment after its run finished (a late press)                                     | done: VPS retest passed 2026-11-24               |
| 6i.16 | Mohammad | Add a rule with a pattern like ^(unclosed (2.4.3)                                                     | done: VPS retest passed 2026-11-24               |
| 6i.17 | Mohammad | Use Allow a folder, except…, remove the exception, read the grant's title (2.4.8)                     | done: VPS retest passed 2026-11-24               |
| 6i.18 | Mohammad | Open a pending rule request and answer several escalations with Always allow (2.7.1, 2.7.8)           | done for the clipping; stacked notices not tried |
| 6i.19 | Malek    | After an Administrator denies an escalation, read the agent's explanation to the User (2.7.9, 2.7.9c) | done: VPS retest passed 2026-11-24               |
