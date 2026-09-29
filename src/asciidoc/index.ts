// The AsciiDoc notation's prose renderer. `@asciidoctor/core` is an optional
// peer dependency: only languages that read AsciiDoc install it, and bundlers
// resolve it to its browser build.
import { load } from "@asciidoctor/core";
import type { ProseRenderer } from "../notation/prose-renderer.ts";

/**
 * Renders AsciiDoc prose to an HTML fragment using Asciidoctor. Errors are raised.
 *
 * Receives a BLOCK of consecutive prose lines joined by newlines (see
 * renderProseNodes). Multi-line constructs like AsciiDoc tables and
 * cross-references are rendered correctly because the full block is passed to
 * Asciidoctor as one document.
 */
export class AsciidocProseRenderer implements ProseRenderer {
  async renderProse(text: string): Promise<string> {
    const doc = await load(text, { doctype: "article", safe: "safe", header_footer: false });
    return (await doc.convert()) ?? "";
  }
}
