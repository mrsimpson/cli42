// Mermaid sanitizes the text of a diagram with DOMPurify while it parses (see
// node-sanitizer.ts). When DOMPurify is unusable, Mermaid cannot parse any
// diagram with labels, titles or class names — a fault of the setup, never of
// the diagram. Such errors are raised as MermaidSanitizerError, which says
// what to change.

/** Mermaid cannot use its sanitizer, DOMPurify, here: the setup must change. */
export class MermaidSanitizerError extends Error {
  override readonly name = "MermaidSanitizerError";

  constructor(cause: unknown) {
    super(
      `Mermaid cannot parse diagrams here: its DOMPurify is unusable (${messageOf(cause)}) — ` +
        "keep mermaid a runtime dependency of the CLI instead of bundling it, so @cli42/lib " +
        "can prepare the DOMPurify that Mermaid loads",
      { cause },
    );
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : String(error);
}

/** Mermaid's own errors about the diagram; they quote the source, which may say anything. */
const DIAGRAM_ERROR = /^(Parse|Lexical) error\b/u;

/** A call into DOMPurify's API, whatever a bundler named the instance (purify_default …). */
const PURIFY_CALL =
  /\w*purify\w*\.(sanitize|addHook|removeHook|removeHooks|removeAllHooks|setConfig|clearConfig|isValidAttribute)\b/iu;

/** Whether an error comes from DOMPurify: DOMPurify threw it, or a call into it failed. */
export function isSanitizerError(error: unknown): boolean {
  if (error instanceof MermaidSanitizerError) return true;
  const message = messageOf(error);
  if (DIAGRAM_ERROR.test(message)) return false;
  const stack = error instanceof Error ? (error.stack ?? "") : "";
  return PURIFY_CALL.test(message) || /[\\/]dompurify[\\/]/u.test(stack);
}
