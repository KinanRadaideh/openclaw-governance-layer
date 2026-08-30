# Draft email to supervisor: T7 search-tool gap

**Subject:** Question about a security gap in the governance layer, and whether forking a second project is acceptable

---

Dear Dr. Haitham,

I have run into a design decision on the graduation project that I would rather
not settle on my own, because one of the possible answers would widen the scope
of the project quite a lot. I would appreciate your view on it. I have written
this without assuming any knowledge of the internals, so it is longer than it
would otherwise need to be.

## What the system does

The project is a security layer for AI agents, meaning programs where a language
model is allowed to act on a computer rather than only produce text. The model
cannot reach the machine directly. It can only ask for specific named
capabilities, which are called tools. One tool opens a file, another searches
inside files, another lists the contents of a folder.

My layer sits in front of every one of those requests. Before any tool runs, my
code is asked whether the agent is permitted to do what it is about to do. It
checks the rules the administrator has written, gives an answer, and records what
happened in a log that cannot be altered afterwards. Nothing the agent does
reaches the operating system without going through it.

## The problem

For most tools this works cleanly, because the tool touches exactly the thing it
asked for. If the agent asks to open a specific file, my layer is shown that
file, checks it against the rules, and refuses if a rule forbids it.

Search tools do not behave that way. When an agent runs a search, it names only a
starting point, such as "this project folder". The search program then works its
way downwards through every subfolder underneath it and opens every file it
finds. This downward walk is called recursion, and it is the main reason search
tools are useful.

The consequence is that a rule such as "this agent may never read the password
file" behaves in two different ways depending on how the agent approaches it. If
the agent asks for the password file directly, my layer refuses, exactly as
intended. If instead the agent searches the folder that contains that file, my
layer allows it, because the folder itself is permitted. The search then opens
the password file along with everything else, and its contents are returned to
the model.

So the rule is enforced when it is approached directly and avoided when it is
approached indirectly. My layer does not malfunction at any point. It is simply
never shown the file that matters, because that file was never named in the
request. It was found by the search program afterwards, once my layer had already
given its answer.

## What I have built so far

I have closed the half of this that can be closed. When a search finishes, my
code reads back the list of files it reported, checks each one against the rules,
and writes any forbidden file into the tamper-evident log, marked clearly as
something that happened without being judged.

The result is that the problem is now visible and provable. It is not yet
prevented, and prevention is the part I am asking about.

## Why prevention is difficult

I looked at three ways of stopping it. Each one runs into a different obstacle.

The first is to restrict where a search is allowed to begin. This is what my own
design notes recommended, and on investigation it does not work. The usual
situation is a forbidden file sitting inside a folder that the agent is otherwise
entitled to use. A starting point is a single location, and there is no way to
say "begin here, but leave out that one file". I can only move the starting point
further down, which either fails to exclude the file or throws away most of what
the user legitimately asked for.

The second is to hand the search program a list of files to skip. The search
programs my system relies on do accept instructions of that kind, so in principle
the forbidden files would never be opened at all. This would be the strongest
possible fix. The difficulty is that the two sides describe files in different
languages. The search programs accept glob patterns, which are the simple
wildcard expressions most people have seen, such as `*.txt` for "anything ending
in .txt". The rules in my system are written as regular expressions, which are a
much more expressive way of describing text and can state conditions that a glob
cannot represent at all. Simple rules could be translated, but expressive ones
could not, and those would quietly be left unenforced. That would give a
protection that looks complete while failing for an unpredictable subset of
rules, which I think is worse than a gap that is written down, because nobody
would think to keep checking.

The third is to let the search run and then remove the forbidden results before
the model is allowed to see them, telling the agent that some results were
withheld. This works in the same language the rules are written in, so the
translation problem does not arise. The file is still read from the disk, but its
contents never reach the model, which for this kind of layer is the line that
matters. This approach does work, but only for half of the system, and that is
the part I would like your guidance on.

## The obstacle I cannot get around

The platform I forked can run an agent in two different ways.

In the first, the agent runs inside the application itself. The application holds
the search results in its own memory before passing them to the model, so I am
able to inspect them and take things out. The third approach works here without
difficulty.

In the second, the application starts a separate program and communicates with it
across a process boundary. That separate program is Codex, an independent
open-source agent written in Rust. Codex carries out the search itself, inside
its own process, and afterwards tells my application what it did.

The fixed set of messages that two such programs are allowed to exchange is
called a protocol, which is essentially a contract setting out what may be asked
and what may be answered. That contract does allow my layer to refuse a tool
before it runs, which is useful. It contains no message that means "here is a
corrected result, use this one instead". This is not a feature that nobody got
around to building. There is no such message in the contract at all, and the
platform's own source code says so in a comment.

The effect is that on the second path I can block a search completely, and I can
record what it did, but I cannot alter what it gives back.

## The options

The first option is to refuse the search outright on both paths. Blocking before
execution does work everywhere. If an agent has file restrictions in force and
asks for a recursive search, the request is refused, and the forbidden file is
never opened. This is the strongest form of prevention, it behaves identically on
both paths, and it is straightforward to test. The cost is that it is blunt. I
cannot tell in advance whether a particular search would have touched a forbidden
file, so I would have to refuse conservatively, and an agent with any file
restriction would lose the ability to search folders that might contain one. I
would make it a setting the administrator chooses rather than the default.

The second option is to remove forbidden results on the internal path and refuse
the search on the external one, using whichever mechanism is available in each
case. The security guarantee would then be the same on both paths, since no
forbidden file's contents would reach the model either way, and only the
convenience to the user would differ. This is more work, and it involves changing
the path that carries every tool result.

The third option is to document the limit and change nothing further. The current
behaviour would stand, and the investigation itself would become the result: the
approach my notes recommended turns out to be unworkable, the second cannot
express the rule language, and the third is blocked by a protocol I do not
control. This would also be the first case in the project where a limitation
blamed on the inherited software is genuinely real. Three earlier claims of that
kind all turned out on investigation to be mistaken, which is a theme in my
evaluation chapter.

The fourth option is the one I want to ask permission for. Codex is open source,
so I could fork it as well, add the missing message to its protocol, and rebuild
it. That would close the gap completely and consistently across both paths.

My hesitation is about scope. It would mean maintaining a second fork, of a
different project, written in a different programming language from the rest of
the work, which is not part of the project at present and is not described
anywhere in the report. It would also mean that the layer only works against my
own modified build of that external program, which weakens one of the claims I
make, namely that the layer governs a real agent platform as it actually ships.

## What I would like to ask

First, whether forking a second external project is acceptable scope for the
graduation project, or whether it goes beyond what is being assessed.

Second, if it is not acceptable, whether you would regard the third option as a
sound engineering outcome, given that the problem is still detected and recorded
in the places where it cannot be prevented.

Third, whether you would instead prefer the first or second option, which enforce
the rules everywhere at a real cost in usability.

For what it is worth, my own inclination is the second option if the schedule
allows it and the third if it does not, since the main remaining task is a live
end-to-end demonstration that I have not yet run. I did not want to decide a
question about the boundaries of the project without asking you first.

Thank you for your time.

Best regards,
Kinan Radaideh
