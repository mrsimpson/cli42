// Links the model ids that rendered prose mentions. A pass over the HTML, not
// the source, so it serves Markdown and AsciiDoc alike and runs after the diff
// marking (`markHtmlChanges`), when the web view holds the whole workspace.

export interface LinkIdsOptions {
  /** The ids of the workspace; only these are linked. */
  ids: { has(id: string): boolean };
  /** The id of the element whose prose this is: never linked to itself. */
  own?: string | null;
  /** The link to an element, or undefined to leave the mention as text. */
  href: (id: string) => string | undefined;
  /** Class of the links (default "c42-id-link"). */
  className?: string;
}

/** Elements whose text is never linked: links themselves, code blocks, headings, scripts. */
const SKIPPED = new Set(["a", "pre", "h1", "h2", "h3", "h4", "h5", "h6", "script", "style"]);

/** An id-like token: letters, digits, "_", "-", and dots between them (`v1.2`). */
const TOKEN = /[\p{L}\p{N}_](?:[\p{L}\p{N}_-]|\.(?=[\p{L}\p{N}_]))*/gu;
const ID_CHAR = /[\p{L}\p{N}_-]/u;

const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>|<!--[\s\S]*?-->/g;

function escapeAttribute(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Link the ids that rendered prose mentions to their elements (see linkIds). */
export function linkElementIds(
  html: string,
  links: { has(id: string): boolean; elementHref(id: string): string | undefined },
  own?: string | null,
): string {
  return linkIds(html, { ids: links, own, href: (id) => links.elementHref(id) });
}

/**
 * Wrap every mention of a known id in `html` in a link to its element. A
 * mention is a whole token: `bb-cli` in "bb-cli-v2" is none. Mentions are not
 * linked inside links, code blocks and headings. Inline code is linked as a
 * whole when its whole text is an id (`` `bb-cli` ``), else left alone.
 */
export function linkIds(html: string, options: LinkIdsOptions): string {
  const className = options.className ?? "c42-id-link";
  const link = (id: string, inner: string): string | undefined => {
    if (id === options.own || !options.ids.has(id)) return undefined;
    const href = options.href(id);
    if (href === undefined) return undefined;
    return `<a class="${className}" href="${escapeAttribute(href)}" data-id="${escapeAttribute(id)}">${inner}</a>`;
  };
  const linkText = (text: string): string =>
    text.replace(TOKEN, (token, offset: number) => {
      // A token continues across an entity or a hyphen at its edges: not a whole mention.
      const before = text[offset - 1];
      const after = text[offset + token.length];
      if ((before && (ID_CHAR.test(before) || before === "&")) || (after && ID_CHAR.test(after)))
        return token;
      return link(token, token) ?? token;
    });

  let out = "";
  let skipDepth = 0;
  const skipped: string[] = [];
  let last = 0;
  TAG.lastIndex = 0;
  for (let match = TAG.exec(html); match; match = TAG.exec(html)) {
    const text = html.slice(last, match.index);
    out += skipDepth > 0 ? text : linkText(text);
    last = TAG.lastIndex;
    const [tag, closing, rawName] = match;
    const name = rawName?.toLowerCase();
    if (!name) {
      out += tag; // comment
      continue;
    }
    if (name === "code" && !closing && skipDepth === 0) {
      const end = html.indexOf("</code>", last);
      if (end >= 0) {
        const inner = html.slice(last, end);
        const whole = decodeEntities(inner.replace(TAG, "")).trim();
        const linked = link(whole, `${tag}${inner}</code>`);
        out += linked ?? `${tag}${inner}</code>`;
        last = end + "</code>".length;
        TAG.lastIndex = last;
        continue;
      }
    }
    if (SKIPPED.has(name)) {
      if (!closing) {
        skipped.push(name);
        skipDepth++;
      } else if (skipped.at(-1) === name) {
        skipped.pop();
        skipDepth--;
      }
    }
    out += tag;
  }
  const rest = html.slice(last);
  return out + (skipDepth > 0 ? rest : linkText(rest));
}
