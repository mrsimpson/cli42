// Command-line conventions shared by the *42 CLIs, so every command of every
// language answers a usage error the same way.

/** Exit code of a usage error: an unknown option value, a missing argument. */
export const USAGE_ERROR = 2;

/**
 * Check a `--format` value against the formats a command accepts.
 *
 * Returns the error message for an unknown value, or `undefined` when it is
 * accepted. The caller prints the message to stderr and exits with
 * `USAGE_ERROR`: a typo such as `--format jsno` must fail where it is made,
 * not later in whatever consumes the output.
 *
 * @example
 * const error = formatError("arc42 validate", format, ["text", "json"]);
 * if (error) { console.error(error); process.exit(USAGE_ERROR); }
 */
export function formatError(
  command: string,
  format: string,
  accepted: readonly string[],
): string | undefined {
  if (accepted.includes(format)) return undefined;
  return `${command}: unknown format '${format}'. Use ${listFormats(accepted)}.`;
}

/** "text", "text or json", "text, json, or tree". */
function listFormats(formats: readonly string[]): string {
  if (formats.length <= 2) return formats.join(" or ");
  return `${formats.slice(0, -1).join(", ")}, or ${formats[formats.length - 1]}`;
}
