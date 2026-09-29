// Line-oriented parser for the Markdown notation of a *42 language: headings,
// prose, `:::type` blocks with `key: value` attributes inside a language fence,
// `:::ignore` directives, `:::diagram` metadata followed by its source fence,
// and bare Mermaid fences. What differs per language is its dialect.

export interface HeadingNode {
  kind: "heading";
  level: number;
  text: string;
  line: number;
}

export interface ProseNode {
  kind: "prose";
  text: string;
  line: number;
  /** HTML fragment populated by the prose renderer post-parse step. Undefined until rendered. */
  renderedHtml?: string;
}

/** A `:::type` block; the dialect's fence flag records whether it sat inside the language fence. */
export interface MarkdownBlockNode {
  kind: "block";
  blockType: string; // raw string — builder rejects unknowns
  attributes: Record<string, string>;
  startLine: number;
  endLine: number;
}

/** Bare Mermaid fenced block with no preceding :::diagram metadata block. */
export interface BareMermaidNode {
  kind: "bare-mermaid";
  source: string;
  startLine: number;
  endLine: number;
}

/** Ignore directive: `:::ignore RULE [reason] :::` inside the language fence. */
export interface IgnoreNode {
  kind: "ignore";
  ruleCode: string;
  reason?: string;
  startLine: number;
  endLine: number;
}

export type MarkdownNode<D, F extends string> =
  | HeadingNode
  | ProseNode
  | (MarkdownBlockNode & Record<F, boolean>)
  | D
  | BareMermaidNode
  | IgnoreNode;

export interface MarkdownDocument<D, F extends string> {
  filePath: string;
  nodes: MarkdownNode<D, F>[];
}

/** The attributes of a closed `:::diagram` block, waiting for its source fence. */
export interface DiagramMetadata {
  attributes: Record<string, string>;
  startLine: number;
}

/** What a language defines about its Markdown notation. */
export interface MarkdownDialect<D, F extends string> {
  /** Info strings of the fence that wraps blocks, e.g. ["arc42"]. */
  fences: readonly string[];
  /** Name of the block node's flag telling whether it sat inside the fence, e.g. "inArc42Fence". */
  fenceFlag: F;
  /** Build the diagram node of a `:::diagram` block and its source (empty when none followed). */
  createDiagram(metadata: DiagramMetadata, source: string, endLine: number): D;
}

interface IgnoreMetadata {
  ruleCode: string;
  reason?: string;
  startLine: number;
}

/**
 * Line-oriented parser for Markdown documents of a *42 language.
 * Parser is intentionally dumb — unknown block types are emitted as-is;
 * the meta-model builder rejects them.
 */
export function parseMarkdown<D, F extends string>(
  filePath: string,
  content: string,
  dialect: MarkdownDialect<D, F>,
): MarkdownDocument<D, F> {
  const lines = content.split("\n");
  const nodes: MarkdownNode<D, F>[] = [];
  const fenceOpen = new RegExp(`^\`\`\`(?:${dialect.fences.join("|")})\\s*$`);
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

  let inHtmlComment = false;
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1; // 1-indexed
    const line = lines[i]!;

    // Track HTML comment blocks (<!-- ... -->) and skip their contents.
    // This allows template guidance to include example :::blocks without them being parsed.
    // Handle both single-line (<!-- foo -->) and multi-line comments.
    if (!inHtmlComment) {
      const openIdx = line.indexOf("<!--");
      if (openIdx !== -1) {
        const closeIdx = line.indexOf("-->", openIdx + 4);
        if (closeIdx === -1) {
          // Opens but does not close on this line — enter comment mode
          inHtmlComment = true;
        }
        // Skip this line regardless (comment open on this line)
        continue;
      }
    } else {
      if (line.includes("-->")) {
        inHtmlComment = false;
      }
      continue;
    }

    if (openBareMermaid) {
      if (/^```\s*$/.test(line)) {
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
      if (/^```\s*$/.test(line)) {
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
      // A diagram metadata block is closed before its Mermaid source fence.
      // While waiting for that source, the first bare fence is the enclosing
      // language fence, not the diagram source itself.
      if (inFence && /^```\s*$/.test(line)) {
        inFence = false;
        continue;
      }
      const fenceMatch = /^```([a-zA-Z0-9_-]+)?\s*$/.exec(line);
      if (fenceMatch) {
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
      // Line contains rule code and/or reason - extract it
      // The line should be: ruleCode [reason] (without the :::: prefix)
      const contentMatch = /^([^:\s]+)(?:\s+(.*?))?\s*$/.exec(line);
      if (contentMatch) {
        // Verify it looks like a rule code (starts with letter/number, may contain dots)
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

    // Language fence (e.g. ```arc42 ... ```) wraps :::blocks for Markdown renderer compatibility.
    // Only recognised outside diagram states to avoid conflicting with the diagram source fence.
    if (!openDiagram && !pendingDiagram && !openBareMermaid) {
      if (fenceOpen.test(line)) {
        inFence = true;
        continue;
      }
      if (inFence && /^```\s*$/.test(line)) {
        inFence = false;
        continue;
      }

      // Bare Mermaid fenced block (no preceding :::diagram block).
      // Emit as BareMermaidNode so the renderer can still display it,
      // and the validator (W017) can warn about the missing :::diagram block.
      const bareMermaidMatch = /^```(mermaid[a-zA-Z0-9_-]*)\s*$/.exec(line);
      if (bareMermaidMatch && !inFence) {
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
          // Multi-line ignore directive (shouldn't happen with single-line syntax)
          // Emit as ignore node with no content
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

    // Opening fence: :::type or single-line directive like :::ignore RULE [reason] :::
    // Check for single-line ignore directive first (entire directive on one line)
    // This matches the complete directive on one line.
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
    // Check for bare/malformed ignore (opening but no rule code) with closing on same line
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

    // A bare ignore marker outside the language fence is ordinary Markdown, not
    // an unknown block and therefore must not create a parse error.
    if (!inFence && /^:::ignore\s*$/.test(line)) {
      nodes.push({ kind: "prose", text: line, line: lineNo });
      continue;
    }

    // Opening fence: :::type or single-line directive
    // Check for ignore directive first (before general :::type pattern)
    // Only recognize ignore directives inside the language fence
    if (inFence && line.startsWith(":::ignore")) {
      // Single-line directive: :::ignore RULE [reason] :::
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
      const bareMatch = /^:::ignore\s*$/.exec(line);
      if (bareMatch) {
        pendingIgnore = {
          ruleCode: "",
          reason: undefined,
          startLine: lineNo,
        };
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

    // Heading
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line);
    if (headingMatch) {
      nodes.push({
        kind: "heading",
        level: headingMatch[1]!.length,
        text: headingMatch[2]!.trim(),
        line: lineNo,
      });
      continue;
    }

    // Prose: emit all lines outside blocks, including blank lines.
    // Blank lines must be preserved so that marked receives the correct
    // paragraph/table boundaries (e.g. a blank line between a table and the
    // following paragraph prevents marked from absorbing the paragraph as a
    // table row in its first column).
    nodes.push({ kind: "prose", text: line, line: lineNo });
  }

  // Unclosed block at end of file → emit a sentinel so E005/parse-error fires
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

  // Process any pending diagram at EOF (diagram block was closed but no fence followed)
  if (pendingDiagram) {
    nodes.push(dialect.createDiagram(pendingDiagram, "", pendingDiagram.startLine));
  }

  return { filePath, nodes };
}
