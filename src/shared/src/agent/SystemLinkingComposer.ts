import type {
  MessageComposer,
  MessageComposerInput,
} from "./Executor";

/**
 * Pluggable URL opener — typed as the subset of React Native's `Linking`
 * the composer uses. In React Native the default is `Linking.openURL`; on
 * web the same module forwards to `window.open` / location changes, which
 * makes the system mailto / sms handler kick in identically. Tests pass a
 * plain jest.fn().
 */
export interface URLOpener {
  openURL(url: string): Promise<void> | Promise<boolean> | void;
}

export interface SystemLinkingComposerOptions {
  openURL: URLOpener["openURL"];
}

/**
 * Default `MessageComposer` for Slice 9 SendMessage actions. Builds an
 * `sms:` or `mailto:` URL and hands it off to the host system via the
 * injected URL opener — works the same way on iOS, Android, and web,
 * with the OS routing to its default messaging / mail app.
 *
 * The send itself happens in the system UI, outside the app's
 * observation — the Executor logs an `occurred` Interaction on User
 * accept, not on detected send (best-effort per the slice brief).
 */
export class SystemLinkingComposer implements MessageComposer {
  private readonly openURL: URLOpener["openURL"];

  constructor(opts: SystemLinkingComposerOptions) {
    this.openURL = opts.openURL;
  }

  async compose(input: MessageComposerInput): Promise<void> {
    if (!input.to || input.to.length === 0) {
      throw new Error("SystemLinkingComposer: at least one recipient required");
    }

    const url =
      input.channel === "text"
        ? buildSmsUrl(input.to, input.body)
        : buildMailtoUrl(input.to, input.subject, input.body);

    await this.openURL(url);
  }
}

function buildSmsUrl(to: string[], body: string): string {
  // iOS's `sms:` accepts a comma-separated list of recipients with NO
  // whitespace; Android also accepts comma. Strip spaces from each number
  // to be safe — formatting like "+61 400 000 000" is common in address
  // books and would otherwise break the link.
  const recipients = to.map((r) => r.replace(/\s+/g, "")).join(",");
  const query = `body=${encodeURIComponent(body)}`;
  return `sms:${recipients}?${query}`;
}

function buildMailtoUrl(
  to: string[],
  subject: string | undefined,
  body: string,
): string {
  const recipients = to.join(",");
  const params: string[] = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${recipients}?${params.join("&")}`;
}
