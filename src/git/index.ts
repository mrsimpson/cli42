// Git access for workspaces: repository location, the snapshots a diff
// compares, the files of a commit, and the history of the documents.
export { git, gitLsFiles, nulSeparated, workspaceLocation, workspacePath } from "./git.ts";
export {
  EMPTY_TREE,
  WORKING_TREE,
  changedFiles,
  resolveComparison,
  untrackedDocuments,
} from "./comparison.ts";
export type { Comparison, DiffSpec, SnapshotSource } from "./comparison.ts";
export { readCommitFiles, readDocumentBlob } from "./commit-files.ts";
export type { CommitFiles } from "./commit-files.ts";
export { commitDiffSpec, errorMessage, listDocumentHistory } from "./history.ts";
export type { DocumentCommit, DocumentHistory } from "./history.ts";
