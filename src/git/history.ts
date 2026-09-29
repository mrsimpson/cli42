import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import type { DiffSpec } from "./comparison.ts";
import { git, workspacePath } from "./git.ts";

/** A commit that touched documents of the workspace, or the uncommitted changes. */
export interface DocumentCommit {
  /** Commit id; null for uncommitted changes in the working tree. */
  commit: string | null;
  /** First parent; null for a root commit. For the working tree: HEAD. */
  parent: string | null;
  author: string;
  /** ISO 8601 author date; for the working tree, when it was read. */
  date: string;
  subject: string;
  /** Raw commit message body; empty when there is none. */
  body: string;
}

export interface DocumentHistory {
  /** Repository root. */
  root: string;
  /** Newest first; the uncommitted changes lead when there are any. */
  commits: DocumentCommit[];
}

const FIELD = "\u001f";
const RECORD = "\u001e";

/** Pathspecs selecting the documents of the workspace by their file extensions. */
function documentPathspecs(root: string, dir: string, extensions: readonly string[]): string[] {
  const workspace = workspacePath(root, dir);
  const prefix = workspace === "" ? "" : `${workspace}/`;
  return extensions.map((extension) => `:(glob)${prefix}**/*${extension}`);
}

function hasUncommittedChanges(root: string, pathspecs: string[]): boolean {
  try {
    execFileSync("git", ["-C", root, "diff", "HEAD", "--quiet", "--", ...pathspecs]);
    return false;
  } catch (error) {
    // `git diff --quiet` exits 1 for differences; anything else is a failure.
    if ((error as { status?: number }).status === 1) return true;
    throw error;
  }
}

/**
 * List the first-parent commits that touched documents of the workspace in
 * `dir` — files ending in one of `extensions` — newest first, led by the
 * uncommitted changes when there are any. Throws outside a Git repository.
 */
export function listDocumentHistory(dir: string, extensions: readonly string[]): DocumentHistory {
  const root = git(resolve(dir), ["rev-parse", "--show-toplevel"]).trim();
  const pathspecs = documentPathspecs(root, dir, extensions);
  const log = git(root, [
    "log",
    "--first-parent",
    `--format=%H${FIELD}%P${FIELD}%an${FIELD}%aI${FIELD}%s${FIELD}%b${RECORD}`,
    "--",
    ...pathspecs,
  ]);
  const commits: DocumentCommit[] = log
    .split(RECORD)
    .map((record) => record.replace(/^\n/, ""))
    .filter((record) => record.length > 0)
    .map((record) => {
      const [commit, parents, author, date, subject, body] = record.split(FIELD);
      return {
        commit: commit!,
        parent: parents?.split(" ")[0] || null,
        author: author ?? "",
        date: date ?? "",
        subject: subject ?? "",
        body: (body ?? "").trim(),
      };
    });
  if (!hasUncommittedChanges(root, pathspecs)) return { root, commits };
  const head = git(root, ["rev-parse", "HEAD"]).trim();
  const uncommitted: DocumentCommit = {
    commit: null,
    parent: head,
    author: "",
    date: new Date().toISOString(),
    subject: "Uncommitted changes",
    body: "",
  };
  return { root, commits: [uncommitted, ...commits] };
}

/**
 * The comparison showing what one entry of the history changed: a commit
 * against its first parent, the working tree against HEAD (staged and
 * unstaged changes alike).
 */
export function commitDiffSpec(commit: Pick<DocumentCommit, "commit">): DiffSpec {
  return commit.commit ? { commit: commit.commit } : { reference: "HEAD" };
}

/** The message of an error, for a history entry that cannot be diffed. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
