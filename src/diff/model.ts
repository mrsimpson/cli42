/**
 * The shape of a workspace as the semantic diff reads it. Each CLI (arc42,
 * biz42) has its own, richer workspace payload; it only has to be structurally
 * compatible with {@link WorkspaceSnapshot}. Every diff type is generic over
 * the concrete payload, so the elements, edges and AST nodes a diff returns
 * keep the CLI's own types.
 */

export interface DiffHeadingNode {
  kind: "heading";
  level: number;
  text: string;
  line: number;
}

export interface DiffProseNode {
  kind: "prose";
  text: string;
  line: number;
}

export interface DiffBlockNode {
  kind: "block";
  attributes: Record<string, string>;
  startLine: number;
}

/** A `:::diagram` block with its fence, or a bare Mermaid fence. */
export interface DiffDiagramNode {
  kind: "diagram" | "bare-mermaid";
  /** Id of a `:::diagram` block; a bare fence has none. */
  id?: string;
  source: string;
  startLine: number;
}

/** A parser directive (e.g. `:::ignore`); carries no content of its own. */
export interface DiffDirectiveNode {
  kind: "ignore";
  startLine: number;
}

export type DiffAstNode =
  | DiffHeadingNode
  | DiffProseNode
  | DiffBlockNode
  | DiffDiagramNode
  | DiffDirectiveNode;

export interface DiffDocumentAst {
  filePath: string;
  nodes: DiffAstNode[];
}

export interface DiffSourceLocation {
  file: string;
  line: number;
}

export interface DiffElement {
  id: string;
  kind: string;
  loc: DiffSourceLocation;
}

export interface DiffDiagram {
  id: string;
  loc: DiffSourceLocation;
}

export interface DiffEdge {
  from: string;
  relation: string;
  to: string;
}

export interface WorkspaceSnapshot {
  documents: DiffDocumentAst[];
  elements: DiffElement[];
  diagrams: DiffDiagram[];
  edges: DiffEdge[];
}

/** The AST node type of a workspace payload. */
export type NodeOf<W extends WorkspaceSnapshot> = W["documents"][number]["nodes"][number];
/** The element type of a workspace payload. */
export type ElementOf<W extends WorkspaceSnapshot> = W["elements"][number];
/** The diagram type of a workspace payload. */
export type DiagramOf<W extends WorkspaceSnapshot> = W["diagrams"][number];
/** The edge type of a workspace payload. */
export type EdgeOf<W extends WorkspaceSnapshot> = W["edges"][number];
