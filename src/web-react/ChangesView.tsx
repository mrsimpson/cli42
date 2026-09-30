import type { MouseEvent, ReactNode } from "react";
import type { DiffView } from "../diff/index.ts";
import type { DiffSegment } from "../diff/index.ts";
import { cx, scope } from "./classes.ts";
import { useWebView } from "./context.tsx";
import type { ViewMode } from "./context.tsx";
import { ChapterDiff, headingClass } from "./ChapterDiff.tsx";
import { ChangeCounts, STATUS_CLASS, snapshotLabel } from "./DiffSegment.tsx";

const styles = scope("changes");
const doc = scope("doc");

/** Where a link in the summary leads: the Documents view or the chapters below. */
export interface ChangeLink {
  href: string;
  onClick?: (event: MouseEvent) => void;
}

/** A finding of the change that needs attention (a block and its prose changed apart…). */
export interface ChangeFinding {
  kind: string;
  message: string;
  file: string;
  line: number;
  elementId?: string;
}

/** The difference the views show — what every language's diff payload carries. */
export interface ChangePayload {
  base: { label: string };
  head: { label: string };
  /** Documents Git does not track yet: not part of the comparison. */
  untracked?: string[];
  /** Lint findings of the change. */
  findings: ChangeFinding[];
  view: DiffView;
}

/** A language's additions to the summary, e.g. groups of its own findings. */
export interface ChangeExtensions<P extends ChangePayload> {
  /** The findings shown under "Warnings" (default: all findings). */
  warnings?: (diff: P) => readonly ChangeFinding[];
  /** Further groups, after the warnings. */
  attention?: (diff: P, elementLink: (id: string) => ChangeLink | null) => ReactNode;
}

interface ChangesViewProps<P extends ChangePayload> {
  diff: P | null;
  /** Set when the difference could not be computed (serve --diff reload failure). */
  error: string | null;
  viewMode: ViewMode;
  /** Heading of the view (default "Changes"). */
  title?: string;
  /** Shown below the heading, e.g. commit metadata. */
  meta?: ReactNode;
  /** Link to an element, if it can be shown. */
  elementLink: (elementId: string) => ChangeLink | null;
  /** Link to the changes of a document. */
  documentLink: (file: string) => ChangeLink;
  /**
   * Render the changed chapters below the summary (without the full
   * documents, unchanged sections are skeletons).
   */
  withChapters?: boolean;
  targetElementId?: string | null;
  onTargetConsumed?: () => void;
  extensions?: ChangeExtensions<P>;
}

export function ChangeLinkTo({
  link,
  children,
  testId,
}: {
  link: ChangeLink | null;
  children: ReactNode;
  testId?: string;
}) {
  if (!link) return <>{children}</>;
  return (
    <a href={link.href} onClick={link.onClick} data-testid={testId}>
      {children}
    </a>
  );
}

function basename(file: string): string {
  return file.replace(/\\/g, "/").split("/").pop() ?? file;
}

/**
 * Review summary of one difference: what needs attention first, then a
 * compact index of what changed — each item linking to the change.
 */
export function ChangesView<P extends ChangePayload>({
  diff,
  error,
  viewMode,
  title = "Changes",
  meta,
  elementLink,
  documentLink,
  withChapters = false,
  targetElementId,
  onTargetConsumed,
  extensions,
}: ChangesViewProps<P>) {
  const { labels } = useWebView();
  return (
    <article className={styles.changes} data-testid="changes-view">
      <h1 className={cx(headingClass(1), doc.chapterTitle)}>{title}</h1>
      {meta}
      {diff && (
        <p className={styles.range} data-testid="changes-range">
          <code>{snapshotLabel(diff.base.label)}</code>
          <span aria-hidden="true"> → </span>
          <span className={styles.visuallyHidden}> to </span>
          <code>{snapshotLabel(diff.head.label)}</code>
        </p>
      )}
      {diff?.untracked && diff.untracked.length > 0 && (
        <div className={styles.untracked} role="note" data-testid="diff-untracked">
          <strong>Not part of this comparison:</strong> Git does not track{" "}
          {diff.untracked.length === 1 ? "this document" : "these documents"} yet. Add{" "}
          {diff.untracked.length === 1 ? "it" : "them"} with <code>git add</code> to include{" "}
          {diff.untracked.length === 1 ? "it" : "them"}.
          <ul role="list">
            {diff.untracked.map((file) => (
              <li key={file}>
                <code>{file}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {error !== null && (
        <div className={styles.error} role="alert" data-testid="diff-error">
          <strong>The difference could not be computed.</strong>
          <pre>{error}</pre>
        </div>
      )}
      {diff && error === null && diff.view.documents.length === 0 && (
        <p className={styles.empty} data-testid="changes-empty">
          No {labels.model} changes.
        </p>
      )}
      {diff && error === null && (
        <>
          <Warnings
            findings={extensions?.warnings?.(diff) ?? diff.findings}
            elementLink={elementLink}
          />
          {extensions?.attention?.(diff, elementLink)}
          <ChangeIndex diff={diff} elementLink={elementLink} documentLink={documentLink} />
          {withChapters &&
            diff.view.documents.map((document) => (
              <ChapterDiff
                key={document.file}
                diff={document}
                viewMode={viewMode}
                targetElementId={targetElementId}
                onTargetConsumed={onTargetConsumed}
              />
            ))}
        </>
      )}
    </article>
  );
}

/** Findings that need attention before the change is accepted. */
function Warnings({
  findings,
  elementLink,
}: {
  findings: readonly ChangeFinding[];
  elementLink: (elementId: string) => ChangeLink | null;
}) {
  if (findings.length === 0) return null;
  return (
    <section className={styles.findings} aria-label="Warnings" data-testid="diff-warnings">
      <h2 className={styles.groupTitle}>Warnings</h2>
      <p className={styles.groupHint}>
        A block and the prose that explains it should change together.
      </p>
      <ul role="list">
        {findings.map((finding, index) => (
          <li
            key={`${finding.kind}-${finding.file}-${finding.line}-${index}`}
            className={styles.warning}
            data-testid="diff-finding"
          >
            <ChangeLinkTo link={finding.elementId ? elementLink(finding.elementId) : null}>
              {finding.message}
            </ChangeLinkTo>
            <code className={styles.location}>
              {basename(finding.file)}
              {finding.line > 0 ? `:${finding.line}` : ""}
            </code>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A group of the summary, as a language's extension shows one. */
export function ChangeGroup({
  title,
  hint,
  testId,
  collapsed = false,
  children,
}: {
  title: string;
  hint?: ReactNode;
  testId?: string;
  /** Collapsed into a <details> with the title as summary. */
  collapsed?: boolean;
  children: ReactNode;
}) {
  if (collapsed) {
    return (
      <details className={styles.findings} data-testid={testId}>
        <summary className={styles.groupTitle}>{title}</summary>
        {children}
      </details>
    );
  }
  return (
    <section className={styles.findings} aria-label={title} data-testid={testId}>
      <h2 className={styles.groupTitle}>{title}</h2>
      {hint && <p className={styles.groupHint}>{hint}</p>}
      {children}
    </section>
  );
}

function segmentItems(segment: DiffSegment) {
  const items = [
    ...segment.elements.map((change) => ({
      key: change.id,
      label: change.id,
      elementId: change.id as string | null,
      status: change.status === "unchanged" ? "modified" : change.status,
    })),
    ...segment.diagrams.map((change) => ({
      key: `diagram-${change.id}`,
      label: change.id,
      elementId: null,
      status: change.status,
    })),
  ];
  if (segment.prose) {
    items.push({
      key: `section-${segment.section.headingPath.join("/")}`,
      label: `§ ${segment.section.headingPath[segment.section.headingPath.length - 1] ?? "Preamble"}`,
      elementId: null,
      status: segment.prose.status,
    });
  }
  return items;
}

/** Compact index of what changed, per chapter. */
function ChangeIndex({
  diff,
  elementLink,
  documentLink,
}: {
  diff: ChangePayload;
  elementLink: (elementId: string) => ChangeLink | null;
  documentLink: (file: string) => ChangeLink;
}) {
  if (diff.view.documents.length === 0) return null;
  return (
    <section className={styles.index} aria-label="Changed chapters" data-testid="diff-index">
      <h2 className={styles.groupTitle}>Changed chapters</h2>
      <ul role="list">
        {diff.view.documents.map((document) => (
          <li key={document.file} data-testid="diff-index-document" data-file={document.file}>
            <span className={styles.indexTitle}>
              <ChangeLinkTo link={documentLink(document.file)} testId="diff-index-document-link">
                {document.title}
              </ChangeLinkTo>
              <ChangeCounts {...document} />
            </span>
            <span className={styles.indexItems}>
              {document.segments.flatMap(segmentItems).map((item) => (
                <span
                  key={item.key}
                  className={cx(styles.chip, STATUS_CLASS[item.status])}
                  data-testid="diff-index-item"
                  data-status={item.status}
                >
                  <ChangeLinkTo link={item.elementId ? elementLink(item.elementId) : null}>
                    {item.label}
                  </ChangeLinkTo>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
