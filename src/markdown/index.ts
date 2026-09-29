// The Markdown notation's prose renderer — browser-safe. Used when parsing
// documents (prose is rendered once, in the backend) and for commit messages,
// which are Markdown whatever a workspace's notation.
import { marked } from "marked";
import type { ProseRenderer } from "../notation/prose-renderer.ts";

/** Renders Markdown prose to an HTML fragment using marked. Errors are raised. */
export class MarkdownProseRenderer implements ProseRenderer {
  renderProse(text: string): string {
    return marked.parse(text, { async: false }) as string;
  }
}

/** Render Markdown text to an HTML fragment. */
export function renderMarkdown(text: string): string {
  return marked.parse(text, { async: false }) as string;
}
