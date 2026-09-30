// Semantic diff of two workspace snapshots and its render-ready view.
export { diffWorkspaces } from "./workspace-diff.ts";
export type {
  AttributeChange,
  ChangeStatus,
  DiagramChange,
  DiffOptions,
  DocumentChangeSummary,
  EdgeChange,
  ElementChange,
  Location,
  ProseSectionChange,
  SectionRef,
  WorkspaceDiff,
} from "./workspace-diff.ts";
export { buildDiffView } from "./diff-view.ts";
export type {
  DiffDocument,
  DiffSegment,
  DiffView,
  DiffViewOptions,
  OutlineEntry,
  SectionContent,
} from "./diff-view.ts";
export { changeCounts, consistencyFindings, isSemanticChange } from "./findings.ts";
export type { ProseMention, ProseRelevanceOptions } from "./relevance.ts";
export type { ConsistencyFinding } from "./findings.ts";
export type {
  DiagramOf,
  DiffAstNode,
  DiffBlockNode,
  DiffDiagram,
  DiffDiagramNode,
  DiffDirectiveNode,
  DiffDocumentAst,
  DiffEdge,
  DiffElement,
  DiffHeadingNode,
  DiffProseNode,
  DiffSourceLocation,
  EdgeOf,
  ElementOf,
  NodeOf,
  WorkspaceSnapshot,
} from "./model.ts";
