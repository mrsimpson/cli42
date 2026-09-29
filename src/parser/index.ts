// Parsers of the notations shared by the *42 languages. One core reads the
// DSL; each notation only tells what a line is (comment, fence, heading, text).
export { parseLines } from "./core.ts";
export type { LineNotation, LineToken } from "./core.ts";
export { MARKDOWN_LINES, parseMarkdown } from "./markdown.ts";
export { ASCIIDOC_LINES, parseAsciidoc } from "./asciidoc.ts";
export type {
  BareMermaidNode,
  DiagramMetadata,
  DslDialect,
  HeadingNode,
  IgnoreNode,
  MarkdownBlockNode,
  MarkdownDialect,
  MarkdownDocument,
  MarkdownNode,
  ProseNode,
} from "./nodes.ts";
