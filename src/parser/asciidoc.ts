// The AsciiDoc notation's lines: //// block comments and // line comments are
// skipped, a [source,x] annotation opens a ---- fence, headings start with =.
import { parseLines } from "./core.ts";
import type { LineNotation, LineToken } from "./core.ts";
import type { DslDialect, MarkdownDocument } from "./nodes.ts";

export const ASCIIDOC_LINES: LineNotation = {
  lines() {
    let inBlockComment = false;
    return (line: string): LineToken => {
      const trimmed = line.trim();
      if (trimmed === "////") {
        inBlockComment = !inBlockComment;
        return { t: "skip" };
      }
      if (inBlockComment) return { t: "skip" };
      if (/^\/\/(?!\/)/.test(trimmed)) return { t: "skip" };
      if (trimmed === "----") return { t: "delim" };
      if (trimmed.startsWith("[source,")) {
        const annotation = /^\[source,\s*([a-zA-Z0-9_-]+)\s*\]/.exec(trimmed);
        return annotation ? { t: "annotation", info: annotation[1]! } : { t: "annotation" };
      }
      const heading = /^(={1,6})\s+(.+)$/.exec(line);
      if (heading) return { t: "heading", level: heading[1]!.length, text: heading[2]!.trim() };
      return { t: "text" };
    };
  },
};

/** Parse an AsciiDoc document of a *42 language. */
export function parseAsciidoc<D, F extends string>(
  filePath: string,
  content: string,
  dialect: DslDialect<D, F>,
): MarkdownDocument<D, F> {
  return parseLines(filePath, content, ASCIIDOC_LINES, dialect);
}
