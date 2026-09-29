/**
 * Render-ready view of a workspace diff: the changed sections ("segments") of
 * both snapshots with their AST nodes (prose already rendered), the elements
 * they define or mention, and the edges between them.
 *
 * A DiffView is self-contained — it can be rendered without the full base or
 * head workspace, which lets one JSON document (or JSONL line) describe a
 * change completely.
 */

import type {
  DiagramOf,
  DiffAstNode,
  DiffEdge,
  DiffElement,
  DiffHeadingNode,
  EdgeOf,
  ElementOf,
  NodeOf,
  WorkspaceSnapshot,
} from "./model.ts";
import {
  SectionMatching,
  SnapshotIndex,
  diffWorkspaces,
  sectionKey as sectionKeyOf,
} from "./workspace-diff.ts";
import type {
  ChangeStatus,
  DiagramChange,
  DiffOptions,
  EdgeChange,
  ElementChange,
  ProseSectionChange,
  Section,
  SectionRef,
  WorkspaceDiff,
} from "./workspace-diff.ts";

export interface SectionContent<W extends WorkspaceSnapshot = WorkspaceSnapshot> {
  /** The section's AST nodes, starting with its heading (none for a preamble). */
  nodes: NodeOf<W>[];
  /** Elements the section defines or mentions (edge endpoints, diagram ids). */
  elements: ElementOf<W>[];
  /** Edges between those elements. */
  edges: EdgeOf<W>[];
  /**
   * Diagrams the section defines, so they can be rendered on their own. Set
   * with {@link DiffViewOptions.sectionDiagrams}.
   */
  diagrams?: DiagramOf<W>[];
}

export interface DiffSegment<W extends WorkspaceSnapshot = WorkspaceSnapshot> {
  /** Added: only in head. Removed: only in base. Modified: in both. */
  status: ChangeStatus;
  /** The head section; the base section for a removed one. */
  section: SectionRef;
  /** Set when the section's heading was renamed (paired by the block it defines). */
  heading?: { before: string; after: string };
  base?: SectionContent<W>;
  head?: SectionContent<W>;
  elements: ElementChange<W>[];
  diagrams: DiagramChange[];
  /** Set when the section holds no blocks and its prose changed. */
  prose?: ProseSectionChange;
}

/** One section of a changed document, in the merged order of base and head. */
export interface OutlineEntry {
  section: SectionRef;
  /** Heading level; 0 for a document preamble. */
  level: number;
  /** Heading text; empty for a preamble. */
  title: string;
  /** "unchanged" sections have no segment. */
  status: ChangeStatus | "unchanged";
  /** True when the section holds nothing but its heading (lets viewers skip placeholders). */
  empty: boolean;
  /** Line range of the section in the head document; absent for removed sections. */
  head?: { startLine: number; endLine: number };
}

export interface DiffDocument<W extends WorkspaceSnapshot = WorkspaceSnapshot> {
  file: string;
  /** H1 text of the head document, or of the base document when it was removed. */
  title: string;
  added: number;
  modified: number;
  removed: number;
  segments: DiffSegment<W>[];
  /**
   * Every section of the document in head order; a removed section follows the
   * base section that preceded it. Positions the segments within the chapter.
   */
  outline: OutlineEntry[];
}

export interface DiffView<W extends WorkspaceSnapshot = WorkspaceSnapshot> {
  documents: DiffDocument<W>[];
  edges: EdgeChange<W>[];
}

export interface DiffViewOptions extends DiffOptions {
  /** Give each section's content the diagrams it defines. */
  sectionDiagrams?: boolean;
}

interface SegmentDraft<W extends WorkspaceSnapshot> {
  base?: Section<NodeOf<W>>;
  head?: Section<NodeOf<W>>;
  elements: ElementChange<W>[];
  diagrams: DiagramChange[];
  prose?: ProseSectionChange;
}

function mentionedIds(nodes: DiffAstNode[], known: Map<string, DiffElement>): Set<string> {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (node.kind === "block" && node.attributes.id) ids.add(node.attributes.id);
    if (node.kind === "diagram" || node.kind === "bare-mermaid") {
      for (const token of node.source.split(/[^\w-]+/)) if (known.has(token)) ids.add(token);
    }
  }
  return ids;
}

function sectionContent<W extends WorkspaceSnapshot>(
  section: Section<NodeOf<W>>,
  index: SnapshotIndex<W>,
  edges: EdgeOf<W>[],
  options: DiffViewOptions,
): SectionContent<W> {
  const own = mentionedIds(section.nodes, index.elements);
  const related = new Set(own);
  for (const edge of edges) {
    if (own.has(edge.from)) related.add(edge.to);
    if (own.has(edge.to)) related.add(edge.from);
  }
  return {
    nodes: section.nodes,
    elements: [...related]
      .map((id) => index.elements.get(id))
      .filter((element): element is ElementOf<W> => element !== undefined)
      .sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.filter((edge: DiffEdge) => own.has(edge.from) || own.has(edge.to)),
    ...(options.sectionDiagrams
      ? {
          diagrams: (section.nodes as DiffAstNode[])
            .map((node) =>
              node.kind === "diagram" && node.id !== undefined
                ? index.diagrams.get(node.id)
                : undefined,
            )
            .filter((diagram): diagram is DiagramOf<W> => diagram !== undefined),
        }
      : {}),
  };
}

function documentTitle(payload: WorkspaceSnapshot, file: string): string | undefined {
  const heading = payload.documents
    .find((document) => document.filePath === file)
    ?.nodes.find((node): node is DiffHeadingNode => node.kind === "heading" && node.level === 1);
  return heading?.text.trim();
}

/**
 * Build the render-ready view of the change from `base` to `head`. Pass the
 * `diff` when it was already computed for the same snapshots.
 */
export function buildDiffView<W extends WorkspaceSnapshot>(
  base: W,
  head: W,
  diff: WorkspaceDiff<W> = diffWorkspaces(base, head),
  options: DiffViewOptions = {},
): DiffView<W> {
  const baseIndex = new SnapshotIndex(base, "base", options);
  const headIndex = new SnapshotIndex(head, "head", options);
  const sections = new SectionMatching(baseIndex, headIndex);
  // Keyed by the head section, or by the base section when it was removed.
  const drafts = new Map<string, SegmentDraft<W>>();

  const draftFor = (file: string, line: number, side: "base" | "head") => {
    const index = side === "base" ? baseIndex : headIndex;
    const section = index.sectionContaining(file, line);
    const pair =
      side === "base"
        ? { base: section, head: sections.headOf(section) }
        : { base: sections.baseOf(section), head: section };
    const key = (pair.head ?? section).key;
    const draft = drafts.get(key) ?? { elements: [], diagrams: [] };
    draft.base ??= pair.base;
    draft.head ??= pair.head;
    drafts.set(key, draft);
    return draft;
  };

  for (const change of diff.elements) {
    // An element that moved between sections shows up in both segments.
    if (change.head) draftFor(change.head.file, change.head.line, "head").elements.push(change);
    if (change.base) {
      const draft = draftFor(change.base.file, change.base.line, "base");
      if (!draft.elements.includes(change)) draft.elements.push(change);
    }
  }
  for (const change of diff.diagrams) {
    if (change.head) draftFor(change.head.file, change.head.line, "head").diagrams.push(change);
    if (change.base) {
      const draft = draftFor(change.base.file, change.base.line, "base");
      if (!draft.diagrams.includes(change)) draft.diagrams.push(change);
    }
  }
  for (const change of diff.proseSections) {
    const location = (change.head ?? change.base)!;
    draftFor(location.file, location.line, change.head ? "head" : "base").prose = change;
  }

  const byFile = new Map<string, DiffDocument<W>>();
  for (const draft of drafts.values()) {
    const section = (draft.head ?? draft.base)!;
    const file = section.ref.file;
    const document = byFile.get(file) ?? {
      file,
      title: documentTitle(head, file) ?? documentTitle(base, file) ?? file,
      added: 0,
      modified: 0,
      removed: 0,
      segments: [],
      outline: [],
    };
    document.segments.push({
      status: !draft.base ? "added" : !draft.head ? "removed" : "modified",
      section: section.ref,
      ...(draft.base && draft.head && draft.base.title !== draft.head.title
        ? { heading: { before: draft.base.title, after: draft.head.title } }
        : {}),
      ...(draft.base
        ? { base: sectionContent(draft.base, baseIndex, base.edges as EdgeOf<W>[], options) }
        : {}),
      ...(draft.head
        ? { head: sectionContent(draft.head, headIndex, head.edges as EdgeOf<W>[], options) }
        : {}),
      elements: draft.elements,
      diagrams: draft.diagrams,
      ...(draft.prose ? { prose: draft.prose } : {}),
    });
    byFile.set(file, document);
  }

  for (const summary of diff.documents) {
    const document = byFile.get(summary.file);
    if (!document) continue;
    document.added = summary.added;
    document.modified = summary.modified;
    document.removed = summary.removed;
  }

  // Segments follow the head document order; removed segments keep their base position.
  const position = (segment: DiffSegment<W>) =>
    segment.head?.nodes[0] ? lineOf(segment.head.nodes[0]) : lineOf(segment.base!.nodes[0]!);
  const documents = [...byFile.values()].sort((a, b) => a.file.localeCompare(b.file));
  for (const document of documents) {
    document.segments.sort((a, b) => position(a) - position(b));
    const statuses = new Map<string, ChangeStatus>();
    for (const segment of document.segments) {
      statuses.set(sectionKeyOf(segment.section), segment.status);
    }
    document.outline = documentOutline(document.file, baseIndex, headIndex, sections, statuses);
  }
  return { documents, edges: diff.edges };
}

function outlineEntry(
  section: Section,
  status: OutlineEntry["status"],
  inHead: boolean,
): OutlineEntry {
  const heading = section.nodes[0]?.kind === "heading" ? section.nodes[0] : undefined;
  return {
    section: section.ref,
    level: heading?.level ?? 0,
    title: heading?.text.trim() ?? "",
    status,
    empty: section.nodes.every(
      (node) => node.kind === "heading" || (node.kind === "prose" && node.text.trim() === ""),
    ),
    ...(inHead ? { head: { startLine: section.startLine, endLine: section.endLine } } : {}),
  };
}

/** Merge the section order of base and head; removed sections keep their base position. */
function documentOutline(
  file: string,
  baseIndex: SnapshotIndex,
  headIndex: SnapshotIndex,
  sections: SectionMatching,
  statuses: Map<string, ChangeStatus>,
): OutlineEntry[] {
  const headSections = headIndex.sectionsByFile.get(file) ?? [];
  // Removed sections, grouped by the head counterpart of the last preceding base section that survives.
  const removedAfter = new Map<string | null, Section[]>();
  let anchor: string | null = null;
  for (const section of baseIndex.sectionsByFile.get(file) ?? []) {
    const counterpart = sections.headOf(section);
    if (counterpart) {
      anchor = counterpart.key;
      continue;
    }
    removedAfter.set(anchor, [...(removedAfter.get(anchor) ?? []), section]);
  }
  const removed = (key: string | null) =>
    (removedAfter.get(key) ?? []).map((section) => outlineEntry(section, "removed", false));
  const outline = removed(null);
  for (const section of headSections) {
    outline.push(outlineEntry(section, statuses.get(section.key) ?? "unchanged", true));
    outline.push(...removed(section.key));
  }
  return outline;
}

function lineOf(node: DiffAstNode): number {
  return node.kind === "heading" || node.kind === "prose" ? node.line : node.startLine;
}
