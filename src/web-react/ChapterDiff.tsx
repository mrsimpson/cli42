import { useMemo } from "react";
import type { JSX } from "react";
import type { DiffDocument, OutlineEntry } from "../diff/index.ts";
import { slug } from "../web/slug.ts";
import { cx, scope } from "./classes.ts";
import { useWebView } from "./context.tsx";
import type { ViewMode } from "./context.tsx";
import { ChangeCounts, SegmentView, sectionKeyOf } from "./DiffSegment.tsx";

const styles = scope("changes");
const doc = scope("doc");

type Node = { kind: string; line?: number; startLine?: number };

function lineOf(node: Node): number {
  return node.kind === "heading" || node.kind === "prose"
    ? (node.line ?? 0)
    : (node.startLine ?? 0);
}

/** Heading class of a level (1–4 and deeper). */
export function headingClass(level: number): string {
  return cx(doc.heading, [doc.heading1, doc.heading2, doc.heading3][level - 1] ?? doc.heading4);
}

/** Heading and placeholder of an unchanged section whose content is not loaded. */
function SkeletonSection({ entry }: { entry: OutlineEntry }) {
  const Tag = `h${Math.min(Math.max(entry.level, 2), 6)}` as keyof JSX.IntrinsicElements;
  return (
    <section data-testid="unchanged-section" aria-label={`unchanged: ${entry.title || "Preamble"}`}>
      {entry.level > 1 && (
        <Tag id={slug(entry.title)} className={headingClass(entry.level)}>
          {entry.title}
        </Tag>
      )}
      {!entry.empty && (
        <div className={styles.skeleton} data-testid="section-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
    </section>
  );
}

interface ChapterDiffProps {
  diff: DiffDocument;
  /**
   * The nodes of the full head document, when the page holds the head
   * workspace (`serve/build --diff`): unchanged sections are rendered from
   * it. Without it (history), unchanged sections are heading and skeleton.
   */
  document?: { nodes: readonly unknown[] };
  viewMode: ViewMode;
  targetElementId?: string | null;
  onTargetConsumed?: () => void;
}

/**
 * A changed chapter: every section in document order, changed sections marked
 * inline (removed ones at their former position), unchanged sections rendered
 * from the full document when available, otherwise as heading and skeleton.
 */
export function ChapterDiff({
  diff,
  document,
  viewMode,
  targetElementId,
  onTargetConsumed,
}: ChapterDiffProps) {
  const view = useWebView();
  const segments = useMemo(
    () => new Map(diff.segments.map((segment) => [sectionKeyOf(segment.section), segment])),
    [diff],
  );
  return (
    <article
      className={cx(doc.document, styles.chapter)}
      data-testid="chapter-diff"
      data-file={diff.file}
      id={`chapter-${diff.file}`}
    >
      <header className={styles.chapterHeader}>
        <h1 className={cx(headingClass(1), doc.chapterTitle)}>{diff.title}</h1>
        <ChangeCounts {...diff} />
      </header>
      {diff.outline.map((entry) => {
        const key = sectionKeyOf(entry.section);
        const segment = segments.get(key);
        if (segment) {
          return (
            <SegmentView
              key={key}
              segment={segment}
              viewMode={viewMode}
              targetElementId={targetElementId}
              onTargetConsumed={onTargetConsumed}
            />
          );
        }
        if (document && entry.head) {
          const { startLine, endLine } = entry.head;
          const nodes = (document.nodes as Node[]).filter((node) => {
            const line = lineOf(node);
            return line >= startLine && line <= endLine;
          });
          return (
            <section key={key} data-testid="unchanged-section">
              {view.renderNodes({ nodes, viewMode, targetElementId, onTargetConsumed })}
            </section>
          );
        }
        return <SkeletonSection key={key} entry={entry} />;
      })}
    </article>
  );
}
