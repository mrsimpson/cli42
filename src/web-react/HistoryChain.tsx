import { useEffect, useRef } from "react";
import type { HistoryEntry, HistoryPearl } from "../web/history-format.ts";
import { pearlKey } from "../web/history-source.ts";
import { cx, scope } from "./classes.ts";
import { capitalized, useWebView } from "./context.tsx";
import { ChangeCounts } from "./DiffSegment.tsx";
import type { HistoryState } from "./useHistory.ts";

const styles = scope("history");

interface HistoryChainProps {
  state: HistoryState;
  entries: Map<string, HistoryEntry>;
  chunkErrors: Map<number, string>;
  requestChunk: (chunk: number) => void;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

type PearlState = "pending" | "semantic" | "empty" | "error";

export function pearlState(entry: HistoryEntry | undefined, chunkError?: string): PearlState {
  if (entry) return entry.error ? "error" : entry.semantic ? "semantic" : "empty";
  return chunkError ? "error" : "pending";
}

/** The history as a chain of pearls, newest first. */
export function HistoryChain({
  state,
  entries,
  chunkErrors,
  requestChunk,
  selectedKey,
  onSelect,
}: HistoryChainProps) {
  const { labels } = useWebView();
  if (state.status === "loading") {
    return (
      <p className={styles.note} role="status">
        Loading history…
      </p>
    );
  }
  if (state.status === "unavailable") {
    return (
      <div className={styles.note} data-testid="history-unavailable">
        <strong>No history available.</strong>
        <p>{state.reason}</p>
      </div>
    );
  }
  if (state.pearls.length === 0) {
    return (
      <p className={styles.note} data-testid="history-empty">
        No commit has touched the {labels.model} documents yet.
      </p>
    );
  }
  return (
    <ol
      className={styles.chain}
      data-testid="history-chain"
      aria-label={`${capitalized(labels.model)} history`}
    >
      {state.pearls.map((pearl) => (
        <Pearl
          key={pearlKey(pearl)}
          pearl={pearl}
          entry={entries.get(pearlKey(pearl))}
          chunkError={chunkErrors.get(pearl.chunk)}
          selected={selectedKey === pearlKey(pearl)}
          onSelect={onSelect}
          requestChunk={requestChunk}
        />
      ))}
    </ol>
  );
}

function Pearl({
  pearl,
  entry,
  chunkError,
  selected,
  onSelect,
  requestChunk,
}: {
  pearl: HistoryPearl;
  entry: HistoryEntry | undefined;
  chunkError: string | undefined;
  selected: boolean;
  onSelect: (key: string) => void;
  requestChunk: (chunk: number) => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const state = pearlState(entry, chunkError);

  // Load the pearl's chunk once it scrolls into view (or is selected).
  useEffect(() => {
    if (entry) return;
    if (selected) {
      requestChunk(pearl.chunk);
      return;
    }
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((observed) => {
      if (observed.some((item) => item.isIntersecting)) requestChunk(pearl.chunk);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [entry, selected, pearl.chunk, requestChunk]);

  return (
    <li
      ref={ref}
      className={styles.pearl}
      data-testid="history-pearl"
      data-state={state}
      data-commit={pearlKey(pearl)}
    >
      <button
        type="button"
        className={cx(styles.pearlButton, selected && styles.selected)}
        aria-current={selected ? "true" : undefined}
        data-testid="pearl-select"
        onClick={() => onSelect(pearlKey(pearl))}
      >
        <span className={cx(styles.bead, styles[state])} aria-hidden="true" />
        <span className={styles.label}>
          <span className={styles.subject}>{pearl.subject}</span>
          <span className={styles.meta}>
            {pearl.commit ? pearl.commit.slice(0, 8) : "working tree"} · {pearl.date.slice(0, 10)}
            {entry && entry.semantic && <ChangeCounts {...entry} />}
            {state === "empty" && <span className={styles.tag}>no model change</span>}
            {state === "error" && <span className={styles.errorTag}>error</span>}
          </span>
        </span>
      </button>
    </li>
  );
}
