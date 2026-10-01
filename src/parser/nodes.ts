// The nodes a *42 document parses into, whatever its notation, and the
// dialect a language defines: its fence, the fence flag on blocks, and how a
// diagram node is built.

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
  /** `key: value` attributes; a list attribute (`key:` + `- item` lines) has the value "". */
  attributes: Record<string, string>;
  /** The items of list attributes: `key:` followed by indented `- item` lines. Absent when none. */
  lists?: Record<string, string[]>;
  /** Lines inside the block that are neither attribute nor list item. Absent when none. */
  unreadable?: Array<{ line: number; text: string }>;
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

/** What a language defines about its notations (the same for Markdown and AsciiDoc). */
export interface DslDialect<D, F extends string> {
  /** Info strings of the fence that wraps blocks, e.g. ["arc42"]. */
  fences: readonly string[];
  /** Name of the block node's flag telling whether it sat inside the fence, e.g. "inArc42Fence". */
  fenceFlag: F;
  /** Build the diagram node of a `:::diagram` block and its source (empty when none followed). */
  createDiagram(metadata: DiagramMetadata, source: string, endLine: number): D;
}

/** @deprecated Use DslDialect — the dialect is the same for every notation. */
export type MarkdownDialect<D, F extends string> = DslDialect<D, F>;
