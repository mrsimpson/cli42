import { useEffect, useMemo, useState } from "react";
import type { HistoryEntry, HistoryPearl } from "../web/history-format.ts";
import { versionHref } from "../web/version.ts";
import { scope } from "./classes.ts";
import { ChangesView } from "./ChangesView.tsx";
import type { ChangeExtensions, ChangeLink, ChangePayload } from "./ChangesView.tsx";
import type { ViewMode } from "./context.tsx";

const styles = scope("changes");

interface HistoryEntryViewProps<P extends ChangePayload> {
  pearl: HistoryPearl | undefined;
  entry: HistoryEntry<P> | undefined;
  chunkError: string | undefined;
  requestChunk: (chunk: number) => void;
  viewMode: ViewMode;
  /** The link to an element in the current documents, for elements this entry does not show. */
  elementHref: (elementId: string) => string | undefined;
  /** Show the commit message above the change. */
  messageOpen: boolean;
  onToggleMessage: () => void;
  /** Open the whole workspace as it was at a commit. */
  onBrowse: (commit: string) => void;
  extensions?: ChangeExtensions<P>;
}

/** The change of one pearl of the history. */
export function HistoryEntryView<P extends ChangePayload>({
  pearl,
  entry,
  chunkError,
  requestChunk,
  viewMode,
  elementHref,
  messageOpen,
  onToggleMessage,
  onBrowse,
  extensions,
}: HistoryEntryViewProps<P>) {
  useEffect(() => {
    if (pearl && !entry) requestChunk(pearl.chunk);
  }, [pearl, entry, requestChunk]);

  // Links in the summary scroll to the chapters below; elements the entry does
  // not show lead to the current documents.
  const [targetElementId, setTargetElementId] = useState<string | null>(null);
  const shownElements = useMemo(() => {
    const ids = new Set<string>();
    for (const document of entry?.diff?.view.documents ?? []) {
      for (const segment of document.segments) {
        for (const change of segment.elements) if (change.head) ids.add(change.id);
      }
    }
    return ids;
  }, [entry]);
  const elementLink = (elementId: string): ChangeLink | null => {
    if (shownElements.has(elementId)) {
      return {
        href: `#el-${elementId}`,
        onClick: (event) => {
          event.preventDefault();
          setTargetElementId(elementId);
        },
      };
    }
    const href = elementHref(elementId);
    return href ? { href } : null;
  };
  const documentLink = (file: string): ChangeLink => ({
    href: `#chapter-${file}`,
    onClick: (event) => {
      event.preventDefault();
      document.getElementById(`chapter-${file}`)?.scrollIntoView({ behavior: "smooth" });
    },
  });

  if (!pearl) {
    return (
      <p className={styles.empty} data-testid="history-no-selection">
        Select a commit in the history.
      </p>
    );
  }
  const message = entry?.messageHtml || undefined;
  const meta = (
    <>
      <p className={styles.range} data-testid="history-entry-meta">
        <code>{pearl.commit ? pearl.commit.slice(0, 8) : "working tree"}</code>
        {pearl.author && ` · ${pearl.author}`} · {pearl.date.slice(0, 10)}
        {pearl.commit && (
          <a
            className={styles.messageToggle}
            href={versionHref(pearl.commit)}
            data-testid="browse-version"
            onClick={(event) => {
              event.preventDefault();
              onBrowse(pearl.commit!);
            }}
          >
            Browse this version
          </a>
        )}
        {message && (
          <button
            type="button"
            className={styles.messageToggle}
            aria-expanded={messageOpen}
            data-testid="commit-message-toggle"
            onClick={onToggleMessage}
          >
            {messageOpen ? "Hide commit message" : "Show commit message"}
          </button>
        )}
      </p>
      {message && messageOpen && (
        <section
          className={styles.commitMessage}
          aria-label="Commit message"
          data-testid="commit-message"
          // Rendered on the server from the commit message (repository content).
          dangerouslySetInnerHTML={{ __html: message }}
        />
      )}
    </>
  );
  if (!entry) {
    return (
      <ChangesView<P>
        diff={null}
        error={chunkError ?? null}
        viewMode={viewMode}
        title={pearl.subject}
        elementLink={elementLink}
        documentLink={documentLink}
        extensions={extensions}
        meta={
          <>
            {meta}
            {!chunkError && (
              <p className={styles.empty} role="status" data-testid="history-entry-loading">
                Computing the change…
              </p>
            )}
          </>
        }
      />
    );
  }
  return (
    <ChangesView<P>
      diff={entry.diff ?? null}
      error={entry.error ?? null}
      viewMode={viewMode}
      title={pearl.subject}
      meta={meta}
      elementLink={elementLink}
      documentLink={documentLink}
      withChapters
      targetElementId={targetElementId}
      onTargetConsumed={() => setTargetElementId(null)}
      extensions={extensions}
    />
  );
}
