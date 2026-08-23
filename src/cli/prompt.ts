// Small interactive prompt helpers for CLI confirmations.
import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import { normalizeLowercaseStringOrEmpty } from "@openclaw/normalization-core/string-coerce";
import { isVerbose, isYes } from "../globals.js";
import { toErrorObject } from "../infra/errors.js";

/** Signals that an interactive prompt lost stdin before a complete answer arrived. */
export class PromptInputClosedError extends Error {
  constructor() {
    super("Prompt input closed before an answer was received.");
    this.name = "PromptInputClosedError";
  }
}

type ReadlineInterface = ReturnType<typeof readline.createInterface>;

function questionUntilClose(rl: ReadlineInterface, question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (complete: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      rl.off("close", onClose);
      complete();
    };
    const onClose = () => finish(() => reject(new PromptInputClosedError()));

    // readline.question does not reject on interface close, so race it with the close event.
    rl.once("close", onClose);
    void rl.question(question).then(
      (answer) => finish(() => resolve(answer)),
      (error: unknown) => finish(() => reject(toErrorObject(error, "Non-Error rejection"))),
    );
  });
}

/** Prompts for yes/no input, honoring global `--yes` before opening stdin. */
export async function promptYesNo(question: string, defaultYes = false): Promise<boolean> {
  if (isVerbose() && isYes()) {
    return true;
  }
  if (isYes()) {
    return true;
  }
  const rl = readline.createInterface({ input, output });
  const suffix = defaultYes ? " [Y/n] " : " [y/N] ";
  const answer = normalizeLowercaseStringOrEmpty(
    await questionUntilClose(rl, `${question}${suffix}`).finally(() => {
      rl.close();
    }),
  );
  if (!answer) {
    return defaultYes;
  }
  return answer.startsWith("y");
}

export async function promptText(question: string): Promise<string> {
  const rl = readline.createInterface({ input, output });
  return await questionUntilClose(rl, question).finally(() => {
    rl.close();
  });
}

/**
 * Prompts for a secret without echoing it.
 *
 * Added for the governance CLI login (T5). `promptText` above writes every
 * keystroke back to the terminal, which is right for a username and wrong for
 * a password: it leaves the secret on screen, in a shared terminal, and in the
 * scrollback of whatever recorded the session.
 *
 * Suppression works by muting the readline interface's own output while the
 * question is outstanding. The prompt itself is written first and directly, so
 * the user still sees what is being asked — muting before writing it would ask
 * for a password with no visible question.
 */
export async function promptSecret(question: string): Promise<string> {
  output.write(question);
  const rl = readline.createInterface({ input, output, terminal: true });
  // `_writeToOutput` is readline's own echo hook. Replacing it is the standard
  // way to suppress echo in Node; there is no public option for it, so the
  // underscore is the library's naming and not ours to fix.
  /* eslint-disable no-underscore-dangle */
  const muted = rl as unknown as { _writeToOutput?: (chunk: string) => void };
  const previous = muted._writeToOutput;
  muted._writeToOutput = () => {};
  try {
    return await questionUntilClose(rl, "");
  } finally {
    muted._writeToOutput = previous;
    /* eslint-enable no-underscore-dangle */
    rl.close();
    // The newline the suppressed echo never produced, so the next line of
    // output does not run on from the prompt.
    output.write("\n");
  }
}
