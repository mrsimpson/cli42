import type { ElementChange } from "./workspace-diff.ts";

/** A block and the prose of its section did not change together. */
export interface ConsistencyFinding {
  kind: "block-without-prose-change" | "prose-without-block-change";
  severity: "warning";
  file: string;
  line: number;
  message: string;
  elementId: string;
}

function consistencyFinding(change: ElementChange): ConsistencyFinding | undefined {
  if (change.status === "unchanged") {
    return {
      kind: "prose-without-block-change",
      severity: "warning",
      file: change.head!.file,
      line: change.head!.line,
      elementId: change.id,
      message: `Section prose changed without changing block '${change.id}'.`,
    };
  }
  if (change.proseChanged) return undefined;
  if (change.status === "removed") {
    return {
      kind: "block-without-prose-change",
      severity: "warning",
      file: change.base!.file,
      line: change.base!.line,
      elementId: change.id,
      message: `Block '${change.id}' was deleted without deleting its section prose.`,
    };
  }
  return {
    kind: "block-without-prose-change",
    severity: "warning",
    file: change.head!.file,
    line: change.head!.line,
    elementId: change.id,
    message: `Block '${change.id}' changed without changing its section prose.`,
  };
}

/**
 * Consistency findings of a diff — a block and the prose that explains it
 * must change together — in document order.
 */
export function consistencyFindings(elements: ElementChange[]): ConsistencyFinding[] {
  return elements
    .map(consistencyFinding)
    .filter((finding): finding is ConsistencyFinding => finding !== undefined)
    .sort(
      (a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind),
    );
}

/** Change counts of a diff, summed over its documents. */
export function changeCounts(diff: {
  documents: Array<{ added: number; modified: number; removed: number }>;
}): { added: number; modified: number; removed: number } {
  return diff.documents.reduce(
    (total, document) => ({
      added: total.added + document.added,
      modified: total.modified + document.modified,
      removed: total.removed + document.removed,
    }),
    { added: 0, modified: 0, removed: 0 },
  );
}

/** True when the diff is not empty; false for a reformatting-only change. */
export function isSemanticChange(diff: {
  elements: unknown[];
  diagrams: unknown[];
  edges: unknown[];
  proseSections: unknown[];
}): boolean {
  return (
    diff.elements.length > 0 ||
    diff.diagrams.length > 0 ||
    diff.edges.length > 0 ||
    diff.proseSections.length > 0
  );
}
