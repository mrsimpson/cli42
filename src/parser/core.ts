// The notation-independent parser of the *42 DSL. A notation turns each line
// into a token (comment, fence delimiter, fence opening with an info string,
// source annotation, heading, text); the core reads the DSL from the tokens:
// the language fence, `:::type` blocks with `key: value` attributes,
// `:::ignore` directives, `:::diagram` metadata followed by its source fence,
// and bare Mermaid fences. Everything else is prose, rendered by the notation.
import type {
  BareMermaidNode,
  DiagramMetadata,
  DslDialect,
  MarkdownBlockNode,
  MarkdownDocument,
  MarkdownNode,
} from "./nodes.ts";

/** What one line is, as the notation sees it. */
export type LineToken =
  /** A comment line; skipped entirely. */
  | { t: "skip" }
  /** A fence delimiter without info (``` or ----): closes a fence, or opens one. */
  | { t: "delim" }
  /** A fence opening with its info string on the same line (```arc42). */
  | { t: "open"; info: string }
  /** A source annotation; the fence opens at the next delimiter ([source,arc42] then ----). */
  | { t: "annotation"; info?: string }
  | { t: "heading"; level: number; text: string }
  | { t: "text" };

/** How a notation reads lines; `lines()` returns a fresh (stateful) tokenizer per document. */
export interface LineNotation {
  lines(): (line: string) => LineToken;
}

interface IgnoreMetadata {
  ruleCode: string;
  reason?: string;
  startLine: number;
}

const MERMAID = /^mermaid[a-zA-Z0-9_-]*$/;

/**
 * Parse a document of a *42 language with the given notation.
 * Parser is intentionally dumb — unknown block types are emitted as-is;
 * the meta-model builder rejects them.
 */
export function parseLines<D, F extends string>(
  filePath: string,
  content: string,
  notation: LineNotation,
  dialect: DslDialect<D, F>,
): MarkdownDocument<D, F> {
  const lines = content.split("\n");
  const nodes: MarkdownNode<D, F>[] = [];
  const tokenOf = notation.lines();
  const isLanguageFence = (info: string | undefined) =>
    info !== undefined && dialect.fences.includes(info);
  const isMermaid = (info: string | undefined) => info !== undefined && MERMAID.test(info);
  const block = (node: MarkdownBlockNode, inFence: boolean) =>
    ({ ...node, [dialect.fenceFlag]: inFence }) as MarkdownBlockNode & Record<F, boolean>;

  let openBlock: {
    blockType: string;
    attributes: Record<string, string>;
    startLine: number;
  } | null = null;

  let pendingIgnore: IgnoreMetadata | null = null;
  let pendingDiagram: DiagramMetadata | null = null;
  let openDiagram: {
    metadata: DiagramMetadata;
    source: string[];
  } | null = null;
  let openBareMermaid: { source: string[]; startLine: number } | null = null;
  // A source annotation seen, waiting for its delimiter: the language fence or a bare Mermaid fence.
  let annotated: "language" | "mermaid" | null = null;

  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1; // 1-indexed
    const line = lines[i]!;
    const token = tokenOf(line);

    if (token.t === "skip") continue;

    if (openBareMermaid) {
      if (token.t === "delim") {
        const node: BareMermaidNode = {
          kind: "bare-mermaid",
          source: openBareMermaid.source.join("\n"),
          startLine: openBareMermaid.startLine,
          endLine: lineNo,
        };
        nodes.push(node);
        openBareMermaid = null;
      } else {
        openBareMermaid.source.push(line);
      }
      continue;
    }

    if (openDiagram) {
      if (token.t === "delim") {
        nodes.push(
          dialect.createDiagram(openDiagram.metadata, openDiagram.source.join("\n"), lineNo),
        );
        openDiagram = null;
      } else {
        openDiagram.source.push(line);
      }
      continue;
    }

    if (pendingDiagram) {
      if (line.trim() === "") continue;
      // A diagram metadata block is closed before its source fence. While
      // waiting for that source, the first delimiter inside the language
      // fence closes it; it is not the diagram source itself.
      if (inFence && token.t === "delim") {
        inFence = false;
        continue;
      }
      // A source annotation announces the source fence: its delimiter follows.
      if (token.t === "annotation") continue;
      if (token.t === "open" || token.t === "delim") {
        // Opening fence of the diagram source — do NOT include it in source.
        openDiagram = { metadata: pendingDiagram, source: [] };
        pendingDiagram = null;
        continue;
      }
      nodes.push(dialect.createDiagram(pendingDiagram, "", pendingDiagram.startLine));
      pendingDiagram = null;
    }

    if (pendingIgnore) {
      // Multi-line ignore directive: look for closing :::
      if (/^:::\s*$/.test(line)) {
        nodes.push({
          kind: "ignore",
          ruleCode: pendingIgnore.ruleCode,
          reason: pendingIgnore.reason,
          startLine: pendingIgnore.startLine,
          endLine: lineNo,
        });
        pendingIgnore = null;
        continue;
      }
      // The line should be: ruleCode [reason] (without the ::: prefix)
      const contentMatch = /^([^:\s]+)(?:\s+(.*?))?\s*$/.exec(line);
      if (contentMatch) {
        // Verify it looks like a rule code (starts with letter/number, may contain dashes)
        if (/^[a-zA-Z0-9]+[a-zA-Z0-9-]*$/.test(contentMatch[1]!)) {
          pendingIgnore.ruleCode = contentMatch[1]!;
          pendingIgnore.reason = contentMatch[2] ? contentMatch[2].trim() : undefined;
        } else {
          // Not a valid rule code: retain an inert node rather than silently
          // dropping the malformed source line.
          nodes.push({
            kind: "ignore",
            ruleCode: "",
            startLine: pendingIgnore.startLine,
            endLine: pendingIgnore.startLine,
          });
          pendingIgnore = null;
        }
      } else {
        nodes.push({
          kind: "ignore",
          ruleCode: "",
          startLine: pendingIgnore.startLine,
          endLine: pendingIgnore.startLine,
        });
        pendingIgnore = null;
      }
    }

    // The language fence wraps :::blocks so ordinary renderers show them as
    // code. Only recognised outside diagram states to avoid conflicting with
    // the diagram source fence.
    if (!openDiagram && !pendingDiagram && !openBareMermaid) {
      if (token.t === "open" && isLanguageFence(token.info)) {
        inFence = true;
        continue;
      }
      if (token.t === "annotation" && isLanguageFence(token.info)) {
        annotated = "language";
        continue;
      }
      if (token.t === "annotation" && isMermaid(token.info) && !inFence) {
        annotated = "mermaid";
        continue;
      }
      if (annotated !== null && token.t === "delim") {
        if (annotated === "language") inFence = true;
        else openBareMermaid = { source: [], startLine: lineNo };
        annotated = null;
        continue;
      }
      // An annotation is only one when its delimiter follows (blank lines aside).
      if (annotated !== null && line.trim() !== "") annotated = null;
      if (inFence && token.t === "delim") {
        inFence = false;
        continue;
      }

      // Bare Mermaid fence (no preceding :::diagram block): the renderer can
      // still display it, and a rule warns about the missing :::diagram block.
      if (token.t === "open" && isMermaid(token.info) && !inFence) {
        openBareMermaid = { source: [], startLine: lineNo };
        continue;
      }
    }

    if (openBlock !== null) {
      // Closing fence: ::: optionally followed only by whitespace
      if (/^:::\s*$/.test(line)) {
        if (openBlock.blockType === "diagram" && inFence) {
          pendingDiagram = {
            attributes: openBlock.attributes,
            startLine: openBlock.startLine,
          };
        } else if (openBlock.blockType === "ignore") {
          // A block-form ignore directive without content: emit an inert ignore node
          nodes.push({
            kind: "ignore",
            ruleCode: "",
            reason: undefined,
            startLine: openBlock.startLine,
            endLine: lineNo,
          });
        } else {
          nodes.push(
            block(
              {
                kind: "block",
                blockType: openBlock.blockType,
                attributes: openBlock.attributes,
                startLine: openBlock.startLine,
                endLine: lineNo,
              },
              inFence,
            ),
          );
        }
        openBlock = null;
        continue;
      }

      // Attribute line: key: value
      const attrMatch = /^([a-z][a-z0-9-]*):\s*(.*)$/.exec(line);
      if (attrMatch) {
        openBlock.attributes[attrMatch[1]!] = attrMatch[2]!;
      }
      // Other lines inside block are ignored (future prose extension)
      continue;
    }

    // Single-line ignore directive: :::ignore RULE [reason] ::: (inside the language fence)
    const singleLineIgnore = inFence
      ? /^:::ignore\s+([^:\s]+)(?:\s+(.*?))?\s*:::\s*$/.exec(line)
      : null;
    if (singleLineIgnore) {
      nodes.push({
        kind: "ignore",
        ruleCode: singleLineIgnore[1]!,
        reason: singleLineIgnore[2] ? singleLineIgnore[2].trim() : undefined,
        startLine: lineNo,
        endLine: lineNo,
      });
      continue;
    }
    // Bare/malformed ignore (no rule code) closed on the same line
    if (inFence && /^:::ignore\s*:::$/.test(line)) {
      nodes.push({
        kind: "ignore",
        ruleCode: "",
        reason: undefined,
        startLine: lineNo,
        endLine: lineNo,
      });
      continue;
    }

    // A bare ignore marker outside the language fence is ordinary prose, not
    // an unknown block and therefore must not create a parse error.
    if (!inFence && /^:::ignore\s*$/.test(line)) {
      nodes.push({ kind: "prose", text: line, line: lineNo });
      continue;
    }

    // Ignore directives are only recognised inside the language fence
    if (inFence && line.startsWith(":::ignore")) {
      const singleLineMatch = /^:::ignore\s+([^:\s]+)(?:\s+(.*?))?\s*:::/.exec(line);
      if (singleLineMatch) {
        nodes.push({
          kind: "ignore",
          ruleCode: singleLineMatch[1]!,
          reason: singleLineMatch[2] ? singleLineMatch[2].trim() : undefined,
          startLine: lineNo,
          endLine: lineNo,
        });
        continue;
      }
      // Bare/malformed directive: :::ignore (no rule code, no closing)
      if (/^:::ignore\s*$/.test(line)) {
        pendingIgnore = { ruleCode: "", reason: undefined, startLine: lineNo };
        continue;
      }
      // Multi-line directive opening: :::ignore RULE [reason] (no closing :::)
      const multiLineMatch = /^:::ignore\s+([^:\s]+)(?:\s+(.*?))?\s*$/.exec(line);
      if (multiLineMatch) {
        pendingIgnore = {
          ruleCode: multiLineMatch[1]!,
          reason: multiLineMatch[2] ? multiLineMatch[2].trim() : undefined,
          startLine: lineNo,
        };
        continue;
      }
    }

    // Opening fence: :::type
    const openMatch = /^:::([a-z][a-z0-9-]*)\s*$/.exec(line);
    if (openMatch) {
      openBlock = {
        blockType: openMatch[1]!,
        attributes: {},
        startLine: lineNo,
      };
      continue;
    }

    if (token.t === "heading") {
      nodes.push({ kind: "heading", level: token.level, text: token.text, line: lineNo });
      continue;
    }

    // Prose: emit all lines outside blocks, including blank lines. Blank lines
    // must be preserved so that the prose renderer receives the correct
    // paragraph/table boundaries.
    nodes.push({ kind: "prose", text: line, line: lineNo });
  }

  // Unclosed block at end of file → emit a sentinel so the parse-error rule fires
  if (openBlock !== null) {
    nodes.push(
      block(
        {
          kind: "block",
          blockType: "__parse_error__",
          attributes: {
            message: `Unclosed block ':::${openBlock.blockType}' opened at line ${openBlock.startLine} — add the closing ':::'`,
            startLine: String(openBlock.startLine),
          },
          startLine: openBlock.startLine,
          endLine: lines.length,
        },
        inFence,
      ),
    );
  }

  // A diagram block closed at the end of the file, with no source fence after it
  if (pendingDiagram) {
    nodes.push(dialect.createDiagram(pendingDiagram, "", pendingDiagram.startLine));
  }

  return { filePath, nodes };
}
