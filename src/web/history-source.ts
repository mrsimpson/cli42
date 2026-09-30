import {
  HISTORY_INDEX_FILE,
  historyChunkFile,
  parseJsonLines,
  snapshotBlobFile,
  snapshotTreeFile,
} from "./history-format.ts";
import type { HistoryEntry, HistoryPearl, SnapshotTree } from "./history-format.ts";

/**
 * Where the history lives: `serve` answers under /api/history/,
 * `build --with-history` writes history/ next to the page, and
 * `--single-file` puts the same files into the page itself. All provide the
 * files of history-format.ts.
 */
export type HistorySource = { base: string } | { files: Record<string, string> };

/** Key of a pearl in routes and maps: its commit id, or "worktree". */
export function pearlKey(pearl: { commit: string | null }): string {
  return pearl.commit ?? "worktree";
}

/** Read one history file as text, from the server or the site, or from the page itself. */
export async function readHistoryFile(source: HistorySource, name: string): Promise<string> {
  if ("files" in source) {
    const text = source.files[name];
    if (text === undefined) throw new Error(`The page contains no history file ${name}`);
    return text;
  }
  const url = `${source.base}${name}`;
  const response = await fetch(url);
  if (!response.ok) {
    let reason = `${url} returned ${response.status}`;
    try {
      reason = ((await response.json()) as { error?: string }).error ?? reason;
    } catch {
      // Not a JSON error body — keep the status line.
    }
    throw new Error(reason);
  }
  return response.text();
}

async function readJsonLines<T>(source: HistorySource, name: string): Promise<T[]> {
  return parseJsonLines<T>(await readHistoryFile(source, name));
}

/** The pearls of the history, newest first. */
export function readHistoryIndex(source: HistorySource): Promise<HistoryPearl[]> {
  return readJsonLines<HistoryPearl>(source, HISTORY_INDEX_FILE);
}

/** The entries of one chunk. */
export function readHistoryChunk<D = unknown>(
  source: HistorySource,
  chunk: number,
): Promise<Array<HistoryEntry<D>>> {
  return readJsonLines<HistoryEntry<D>>(source, historyChunkFile(chunk));
}

// Commits and blobs never change: each is loaded once per history source.
const blobCache = new WeakMap<HistorySource, Map<string, Promise<string>>>();
const snapshotCache = new WeakMap<HistorySource, Map<string, Promise<unknown>>>();

function cached<T>(
  cache: WeakMap<HistorySource, Map<string, Promise<T>>>,
  source: HistorySource,
  key: string,
  load: () => Promise<T>,
): Promise<T> {
  let entries = cache.get(source);
  if (!entries) cache.set(source, (entries = new Map()));
  let entry = entries.get(key);
  if (!entry) {
    entry = load();
    // A failed load is not kept: the next attempt reads again.
    entry.catch(() => entries.delete(key));
    entries.set(key, entry);
  }
  return entry;
}

async function readTree(source: HistorySource, commit: string): Promise<SnapshotTree> {
  return JSON.parse(await readHistoryFile(source, snapshotTreeFile(commit))) as SnapshotTree;
}

/** Every tracked path of a tree, following a shared list to the tree that holds it. */
async function trackedPaths(source: HistorySource, tree: SnapshotTree): Promise<string[]> {
  if (tree.paths === undefined) return [];
  if (Array.isArray(tree.paths)) return tree.paths;
  const owner = tree.paths.sameAs;
  const { paths } = await readTree(source, owner);
  if (!Array.isArray(paths)) {
    throw new Error(`The tree of ${owner} refers to another tree instead of listing its paths`);
  }
  return paths;
}

/** The files of one commit's version: its documents (sorted by path) and its tracked paths. */
export interface SnapshotFiles {
  files: Array<{ path: string; content: string }>;
  /** Every tracked path; empty when the history records none. */
  paths: string[];
}

/** Read the documents and tracked paths of one commit from the history. */
export async function readSnapshotFiles(
  source: HistorySource,
  commit: string,
): Promise<SnapshotFiles> {
  const tree = await readTree(source, commit);
  const [paths, files] = await Promise.all([
    trackedPaths(source, tree),
    Promise.all(
      Object.entries(tree.files)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(async ([path, id]) => ({
          path,
          content: await cached(blobCache, source, id, () =>
            readHistoryFile(source, snapshotBlobFile(id)),
          ),
        })),
    ),
  ]);
  return { files, paths };
}

/**
 * The workspace of one commit, built by the language's loader ("files in,
 * model out") from the files of the history, and loaded once per source.
 */
export function loadSnapshot<P>(
  source: HistorySource,
  commit: string,
  load: (snapshot: SnapshotFiles, commit: string) => Promise<P>,
): Promise<P> {
  return cached(
    snapshotCache as WeakMap<HistorySource, Map<string, Promise<P>>>,
    source,
    commit,
    async () => load(await readSnapshotFiles(source, commit), commit),
  );
}
