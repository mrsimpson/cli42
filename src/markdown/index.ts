// The Markdown notation's prose renderer — browser-safe. Used when parsing
// documents (prose is rendered once, in the backend) and for commit messages,
// which are Markdown whatever a workspace's notation.
//
// Prose is repository content shown in a web page: raw HTML in it is shown as
// text, and only web, mail and relative links become links.
import { Marked } from "marked";
import type { ProseRenderer } from "../notation/prose-renderer.ts";

/** Escape text for HTML content and attribute values. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Links that stay links: web, mail, in-page and relative ones. */
const SAFE_URL = /^(https?:|mailto:|#|\.{0,2}\/|[\w-]+(\.[\w-]+)*(\/|$|#))/i;

const marked = new Marked({
  gfm: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const label = this.parser.parseInline(tokens);
      if (!SAFE_URL.test(href)) return label;
      const titled = title ? ` title="${escapeHtml(title)}"` : "";
      return `<a href="${escapeHtml(href)}"${titled}>${label}</a>`;
    },
  },
});

/** Renders Markdown prose to an HTML fragment using marked. Errors are raised. */
export class MarkdownProseRenderer implements ProseRenderer {
  renderProse(text: string): string {
    return renderMarkdown(text);
  }
}

/** Render Markdown text to an HTML fragment. */
export function renderMarkdown(text: string): string {
  return marked.parse(text, { async: false });
}

/** Render one line of Markdown (no paragraph) to an HTML fragment, e.g. a finding's message. */
export function renderMarkdownInline(text: string): string {
  return marked.parseInline(text, { async: false });
}
