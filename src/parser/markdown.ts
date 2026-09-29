// The Markdown notation's lines: HTML comments are skipped, ``` fences carry
// their info string, headings start with #.
import { parseLines } from "./core.ts";
import type { LineNotation, LineToken } from "./core.ts";
import type { DslDialect, MarkdownDocument } from "./nodes.ts";

export const MARKDOWN_LINES: LineNotation = {
  lines() {
    let inHtmlComment = false;
    return (line: string): LineToken => {
      // HTML comment blocks (<!-- ... -->) are skipped with their contents, so
      // template guidance can include example :::blocks without them being
      // parsed. A line that opens a comment is skipped even if it closes it.
      if (!inHtmlComment) {
        const openIdx = line.indexOf("<!--");
        if (openIdx !== -1) {
          if (line.indexOf("-->", openIdx + 4) === -1) inHtmlComment = true;
          return { t: "skip" };
        }
      } else {
        if (line.includes("-->")) inHtmlComment = false;
        return { t: "skip" };
      }
      if (/^```\s*$/.test(line)) return { t: "delim" };
      const open = /^```([a-zA-Z0-9_-]+)\s*$/.exec(line);
      if (open) return { t: "open", info: open[1]! };
      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      if (heading) return { t: "heading", level: heading[1]!.length, text: heading[2]!.trim() };
      return { t: "text" };
    };
  },
};

/** Parse a Markdown document of a *42 language. */
export function parseMarkdown<D, F extends string>(
  filePath: string,
  content: string,
  dialect: DslDialect<D, F>,
): MarkdownDocument<D, F> {
  return parseLines(filePath, content, MARKDOWN_LINES, dialect);
}
