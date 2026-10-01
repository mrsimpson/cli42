// What every *42 web view shares, framework-free: routing, the heading slug,
// grouping of document nodes, linking of id mentions in rendered prose, and
// the history format (also read by the CLIs, which write and serve it).
export { slug } from "./slug.ts";
export {
  DocumentRoutes,
  WorkspaceLinks,
  changesHref,
  formatRoute,
  historyHref,
  parseRoute,
} from "./routing.ts";
export type { ElementLinks, Route, RouteOptions } from "./routing.ts";
export { groupNodes } from "./group.ts";
export type { GroupOptions, RenderGroup } from "./group.ts";
export { linkIds } from "./link-ids.ts";
export type { LinkIdsOptions } from "./link-ids.ts";
export {
  HISTORY_CHUNK_SIZE,
  HISTORY_INDEX_FILE,
  historyChunkFile,
  historyChunkOf,
  parseJsonLines,
  sharePathLists,
  snapshotBlobFile,
  snapshotBlobOf,
  snapshotTreeFile,
  snapshotTreeOf,
  toHistoryPearls,
  toJsonLines,
} from "./history-format.ts";
export type { HistoryEntry, HistoryPearl, SnapshotTree } from "./history-format.ts";
export {
  loadSnapshot,
  pearlKey,
  readHistoryChunk,
  readHistoryFile,
  readHistoryIndex,
  readSnapshotFiles,
} from "./history-source.ts";
export type { HistorySource, SnapshotFiles } from "./history-source.ts";
export { VERSION_CHANGE_EVENT, currentVersion, openVersion, versionHref } from "./version.ts";
