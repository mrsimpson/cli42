import { useCallback, useEffect, useRef, useState } from "react";
import type { HistoryEntry, HistoryPearl } from "../web/history-format.ts";
import {
  loadSnapshot,
  pearlKey,
  readHistoryChunk,
  readHistoryIndex,
} from "../web/history-source.ts";
import type { HistorySource, SnapshotFiles } from "../web/history-source.ts";

export type HistoryState =
  | { status: "loading" }
  | { status: "unavailable"; reason: string }
  | { status: "ready"; pearls: HistoryPearl[] };

function reasonOf(error: unknown): string {
  return String(error).replace(/^Error: /, "");
}

/**
 * Load the pearl index eagerly and entries chunk by chunk on request.
 * `refresh` changes when the server announces new data: the index is
 * reloaded and every loaded chunk is dropped.
 */
export function useHistory<D = unknown>(source: HistorySource | null, refresh: number) {
  const [state, setState] = useState<HistoryState>({ status: "loading" });
  const [entries, setEntries] = useState<Map<string, HistoryEntry<D>>>(new Map());
  const [chunkErrors, setChunkErrors] = useState<Map<number, string>>(new Map());
  const requested = useRef(new Set<number>());

  useEffect(() => {
    if (!source) return;
    let active = true;
    requested.current = new Set();
    setEntries(new Map());
    setChunkErrors(new Map());
    readHistoryIndex(source)
      .then((pearls) => active && setState({ status: "ready", pearls }))
      .catch((error: unknown) => {
        if (active) setState({ status: "unavailable", reason: reasonOf(error) });
      });
    return () => {
      active = false;
    };
  }, [source, refresh]);

  const requestChunk = useCallback(
    (chunk: number) => {
      if (!source || requested.current.has(chunk)) return;
      requested.current.add(chunk);
      readHistoryChunk<D>(source, chunk)
        .then((loaded) =>
          setEntries((previous) => {
            const next = new Map(previous);
            for (const entry of loaded) next.set(pearlKey(entry), entry);
            return next;
          }),
        )
        .catch((error: unknown) =>
          setChunkErrors((previous) => new Map(previous).set(chunk, String(error))),
        );
    },
    [source, refresh], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { state, entries, chunkErrors, requestChunk };
}

export type SnapshotState<P> =
  | { status: "loading" }
  | { status: "error"; reason: string }
  | { status: "ready"; payload: P };

/**
 * The workspace of `commit` (null: none requested), built from the history
 * by the language's loader. `source` is undefined while it is not known yet
 * whether there is a history; null when there is none (`noHistory` says so).
 */
export function useSnapshot<P>(
  source: HistorySource | null | undefined,
  commit: string | null,
  load: (snapshot: SnapshotFiles, commit: string) => Promise<P>,
  noHistory = "This site has no history.",
): SnapshotState<P> {
  // Tagged with its commit, so a switch never shows the previous version as ready.
  const [state, setState] = useState<{ commit: string | null; state: SnapshotState<P> }>({
    commit: null,
    state: { status: "loading" },
  });
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    if (!commit || source === undefined) return;
    if (source === null) {
      setState({ commit, state: { status: "error", reason: noHistory } });
      return;
    }
    let active = true;
    loadSnapshot(source, commit, (snapshot, at) => loader.current(snapshot, at))
      .then((payload) => active && setState({ commit, state: { status: "ready", payload } }))
      .catch(
        (error: unknown) =>
          active && setState({ commit, state: { status: "error", reason: reasonOf(error) } }),
      );
    return () => {
      active = false;
    };
  }, [source, commit, noHistory]);
  return state.commit === commit ? state.state : { status: "loading" };
}
