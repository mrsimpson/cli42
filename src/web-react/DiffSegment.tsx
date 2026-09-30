import { Fragment, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  AttributeChange,
  DiffDocument,
  DiffSegment,
  SectionContent,
  SectionRef,
} from "../diff/index.ts";
import { diffTokens, markHtmlChanges, wordTokens } from "../text-diff/index.ts";
import type { DiffPart } from "../text-diff/index.ts";
import { groupNodes } from "../web/group.ts";
import { cx, scope } from "./classes.ts";
import { renderProseWith, useWebView } from "./context.tsx";
import type { ViewMode, WebView } from "./context.tsx";

const styles = scope("changes");

/** Shorten a commit id to 8 characters; labels such as "working tree" pass through. */
export function snapshotLabel(label: string): string {
  return /^[0-9a-f]{40}$/.test(label) ? label.slice(0, 8) : label;
}

/** Identity of a section across snapshots — the same key the core diff uses. */
export function sectionKeyOf(ref: SectionRef): string {
  return JSON.stringify([ref.file, ref.headingPath, ref.occurrence]);
}

export const STATUS_CLASS: Record<string, string | undefined> = {
  added: styles.added,
  modified: styles.modified,
  removed: styles.removed,
  unchanged: styles.modified,
};

export function ChangeCounts({
  added,
  modified,
  removed,
}: Pick<DiffDocument, "added" | "modified" | "removed">) {
  return (
    <span className={styles.counts}>
      {added > 0 && <span className={styles.countAdded}>+{added}</span>}
      {modified > 0 && <span className={styles.countModified}>~{modified}</span>}
      {removed > 0 && <span className={styles.countRemoved}>−{removed}</span>}
    </span>
  );
}

type Node = { kind: string; text?: string; renderedHtml?: string };

/** Rendered HTML of each prose run of the nodes, in order. */
function proseRunsHtml(view: WebView, nodes: readonly Node[]): string[] {
  return groupNodes(nodes, { isBlock: (node): node is Node => view.isBlock(node) }).flatMap(
    (group) =>
      group.kind === "prose-run"
        ? [group.renderedHtml ?? (group.text ? renderProseWith(view, group.text) : "")]
        : [],
  );
}

/** Render one side of a changed section with the elements it carries. */
function SectionRender({
  content,
  compareTo,
  viewMode,
  targetElementId,
  onTargetConsumed,
}: {
  content: SectionContent;
  /** The other version: prose words that differ from it are marked. */
  compareTo?: SectionContent;
  viewMode: ViewMode;
  targetElementId?: string | null;
  onTargetConsumed?: () => void;
}) {
  const view = useWebView();
  const proseHtml = useMemo(
    () =>
      compareTo
        ? markHtmlChanges(
            proseRunsHtml(view, compareTo.nodes as Node[]),
            proseRunsHtml(view, content.nodes as Node[]),
            { added: styles.proseAdded!, removed: styles.proseRemoved! },
          )
        : undefined,
    [view, content, compareTo],
  );
  return (
    <>
      {view.renderNodes({
        nodes: content.nodes,
        ...(proseHtml ? { proseHtml } : {}),
        content,
        viewMode,
        targetElementId,
        onTargetConsumed,
      })}
    </>
  );
}

function valueText(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function isMultiline(value: unknown): boolean {
  return typeof value === "string" && value.includes("\n");
}

/** One side of a changed single-line value: unchanged text plain, the changed tokens marked. */
function ValueSide({
  parts,
  side,
  separator,
}: {
  parts: DiffPart<string>[];
  side: "before" | "after";
  separator: string;
}) {
  const hidden = side === "before" ? "insert" : "delete";
  const shown = parts.filter((part) => part.op !== hidden);
  if (shown.length === 0) return <>—</>;
  const Mark = side === "before" ? "del" : "ins";
  let first = true;
  return (
    <>
      {shown.flatMap((part, index) =>
        part.values.map((value, position) => {
          const text = `${first ? "" : separator}${value}`;
          first = false;
          return part.op === "equal" ? (
            <Fragment key={`${index}-${position}`}>{text}</Fragment>
          ) : (
            <Mark
              key={`${index}-${position}`}
              className={side === "before" ? styles.before : styles.after}
              data-testid={side === "before" ? "value-removed" : "value-added"}
            >
              {text}
            </Mark>
          );
        }),
      )}
    </>
  );
}

/** Unchanged lines kept around a change in a multi-line value; longer runs collapse. */
const LINE_CONTEXT = 2;

function LineDiff({ before, after }: { before: string; after: string }) {
  const lines = (text: string) =>
    text === "" ? [] : text.split("\n").map((line) => line.trimEnd());
  const parts = diffTokens(lines(before), lines(after));
  const rows: ReactNode[] = [];
  parts.forEach((part, index) => {
    let values = part.values;
    if (part.op === "equal") {
      const head = index === 0 ? 0 : LINE_CONTEXT;
      const tail = index === parts.length - 1 ? 0 : LINE_CONTEXT;
      if (values.length > head + tail + 1) {
        const hidden = values.length - head - tail;
        values = [...values.slice(0, head), "", ...values.slice(values.length - tail)];
        rows.push(
          ...values.map((line, position) =>
            position === head ? (
              <span key={`${index}-gap`} className={styles.lineGap} data-testid="line-gap">
                ⋯ {hidden} unchanged {hidden === 1 ? "line" : "lines"}
              </span>
            ) : (
              <span key={`${index}-${position}`} className={styles.line}>
                {`  ${line}`}
              </span>
            ),
          ),
        );
        return;
      }
    }
    const marker = part.op === "equal" ? " " : part.op === "delete" ? "−" : "+";
    const className =
      part.op === "equal"
        ? styles.line
        : part.op === "delete"
          ? styles.lineRemoved
          : styles.lineAdded;
    rows.push(
      ...values.map((line, position) => (
        <span
          key={`${index}-${position}`}
          className={className}
          data-testid={
            part.op === "equal" ? undefined : `line-${part.op === "delete" ? "removed" : "added"}`
          }
        >
          {`${marker} ${line}`}
        </span>
      )),
    );
  });
  return <pre className={styles.lineDiff}>{rows}</pre>;
}

function AttributeRow({ attribute }: { attribute: AttributeChange }) {
  const { before, after } = attribute;
  if (isMultiline(before) || isMultiline(after)) {
    return (
      <tr data-testid="attribute-change">
        <th scope="row">{attribute.name}</th>
        <td colSpan={2}>
          <LineDiff
            before={before === undefined ? "" : valueText(before)}
            after={after === undefined ? "" : valueText(after)}
          />
        </td>
      </tr>
    );
  }
  const lists = Array.isArray(before) || Array.isArray(after);
  const tokens = (value: unknown): string[] => {
    if (value === undefined) return [];
    if (Array.isArray(value)) return value.map(valueText);
    return wordTokens(valueText(value));
  };
  const parts = diffTokens(tokens(before), tokens(after));
  const separator = lists ? ", " : "";
  return (
    <tr data-testid="attribute-change">
      <th scope="row">{attribute.name}</th>
      <td>
        <ValueSide parts={parts} side="before" separator={separator} />
      </td>
      <td>
        <ValueSide parts={parts} side="after" separator={separator} />
      </td>
    </tr>
  );
}

function AttributeTable({ attributes }: { attributes: AttributeChange[] }) {
  if (attributes.length === 0) return null;
  return (
    <div className={styles.attributesWrap}>
      <table className={styles.attributes}>
        <tbody>
          {attributes.map((attribute) => (
            <AttributeRow key={attribute.name} attribute={attribute} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChangeList({ segment }: { segment: DiffSegment }) {
  const items = [
    ...segment.elements.map((change) => ({
      key: `element-${change.id}`,
      label: change.id,
      kind: change.kind as string,
      status: change.status,
      note: change.proseChanged ? "prose changed" : undefined,
      attributes: change.attributes,
    })),
    ...segment.diagrams.map((change) => ({
      key: `diagram-${change.id}`,
      label: change.id,
      kind: "diagram",
      status: change.status,
      note: undefined,
      attributes: change.attributes,
    })),
  ];
  if (items.length === 0 && !segment.prose) return null;
  return (
    <ul className={styles.changeList} role="list">
      {items.map((item) => (
        <li key={item.key} data-testid="element-change" data-status={item.status}>
          <span className={cx(styles.chip, STATUS_CLASS[item.status])}>
            {item.status === "unchanged" ? "prose" : item.status}
          </span>
          <span className={styles.kind}>{item.kind}</span>
          <code>{item.label}</code>
          {item.note && item.status === "modified" && (
            <span className={styles.note}>{item.note}</span>
          )}
          <AttributeTable attributes={item.attributes} />
        </li>
      ))}
      {segment.prose && (
        <li data-testid="element-change" data-status={segment.prose.status}>
          <span className={cx(styles.chip, STATUS_CLASS[segment.prose.status])}>
            {segment.prose.status}
          </span>
          <span className={styles.kind}>prose</span>
        </li>
      )}
    </ul>
  );
}

/** Status of a section — worded apart from the element status chips inside it. */
const SECTION_STATUS: Record<DiffSegment["status"], string> = {
  added: "Section added",
  modified: "Section changed",
  removed: "Section removed",
};

/** How a changed section's content is shown: marked changes, or one of the two versions. */
type SectionVersion = "changes" | "current" | "previous";

const VERSION_LABEL: Record<SectionVersion, string> = {
  changes: "Changes",
  current: "Current",
  previous: "Previous",
};

function VersionSwitch({
  value,
  onChange,
}: {
  value: SectionVersion;
  onChange: (version: SectionVersion) => void;
}) {
  return (
    <span
      className={styles.versionSwitch}
      role="group"
      aria-label="Show"
      data-testid="version-switch"
    >
      {(Object.keys(VERSION_LABEL) as SectionVersion[]).map((version) => (
        <button
          key={version}
          type="button"
          aria-pressed={value === version}
          onClick={() => onChange(version)}
        >
          {VERSION_LABEL[version]}
        </button>
      ))}
    </span>
  );
}

/** One changed section, marked by status, with both versions available. */
export function SegmentView({
  segment,
  viewMode,
  targetElementId,
  onTargetConsumed,
}: {
  segment: DiffSegment;
  viewMode: ViewMode;
  targetElementId?: string | null;
  onTargetConsumed?: () => void;
}) {
  const [version, setVersion] = useState<SectionVersion>("changes");
  const path = segment.section.headingPath;
  const title = path[path.length - 1] ?? "Preamble";
  const compared = segment.status === "modified" && segment.base && segment.head;
  const head = (compareTo?: SectionContent) =>
    segment.head && (
      <div data-testid="segment-head" data-version={compareTo ? "changes" : "current"}>
        <SectionRender
          content={segment.head}
          {...(compareTo ? { compareTo } : {})}
          viewMode={viewMode}
          targetElementId={targetElementId}
          onTargetConsumed={onTargetConsumed}
        />
      </div>
    );
  return (
    <section
      className={cx(styles.segment, STATUS_CLASS[segment.status])}
      data-testid="diff-segment"
      data-status={segment.status}
      aria-label={`${segment.status}: ${title}`}
    >
      <header className={styles.segmentHeader} data-testid="segment-status">
        <span className={styles.sectionStatus}>{SECTION_STATUS[segment.status]}</span>
        {segment.heading && (
          <span className={styles.headingRename} data-testid="segment-heading-change">
            heading <del className={styles.before}>{segment.heading.before}</del>
            <span aria-hidden="true"> → </span>
            <span className={styles.visuallyHidden}> renamed to </span>
            <ins className={styles.after}>{segment.heading.after}</ins>
          </span>
        )}
        {compared && <VersionSwitch value={version} onChange={setVersion} />}
      </header>
      <ChangeList segment={segment} />
      {segment.status === "removed" && segment.base && (
        <div className={styles.removedContent} data-testid="segment-base">
          <SectionRender content={segment.base} viewMode={viewMode} />
        </div>
      )}
      {segment.status === "added" && head()}
      {compared && version === "changes" && head(segment.base)}
      {compared && version === "current" && head()}
      {compared && version === "previous" && (
        <div data-testid="segment-base">
          <SectionRender content={segment.base!} viewMode={viewMode} />
        </div>
      )}
    </section>
  );
}
