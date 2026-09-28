import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { git, nulSeparated } from "./git.ts";

/**
 * Which two snapshots to compare, following `git diff` semantics:
 *
 * | spec                          | base            | head         |
 * |-------------------------------|-----------------|--------------|
 * | `{}`                          | index           | working tree |
 * | `{ reference }`               | commit          | working tree |
 * | `{ staged: true }`            | HEAD            | index        |
 * | `{ staged: true, reference }` | commit          | index        |
 * | `{ reference: "a..b" }`       | commit a        | commit b     |
 * | `{ reference: "a...b" }`      | merge-base(a,b) | commit b     |
 * | `{ commit }`                  | first parent    | commit       |
 *
 * `{ commit }` shows what a single commit changed; a root commit is compared
 * with the empty tree. It cannot be combined with `reference` or `staged`.
 */
export interface DiffSpec {
  reference?: string;
  staged?: boolean;
  commit?: string;
}

/** Git's well-known id of the empty tree — the base of a root commit. */
export const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/** Label of a snapshot read from the working tree. */
export const WORKING_TREE = "working tree";

/** One side of a comparison: the files of a commit, the index, or the working tree. */
export interface SnapshotSource {
  /** "working tree", "index", "empty", or the resolved commit id. */
  label: string;
  /** Repository-relative paths tracked in this snapshot. */
  paths(): string[];
  read(path: string): string;
}

/** The two snapshots a {@link DiffSpec} compares. */
export interface Comparison {
  base: SnapshotSource;
  head: SnapshotSource;
  /** Commit the comparison is anchored to; HEAD when the base is the index. */
  baseCommit: string;
  /**
   * Commit an acceptance token must match. Undefined when the base is an index
   * that differs from HEAD, because no commit describes it.
   */
  acceptanceBase?: string;
  /** Arguments that make `git diff` compare the same two snapshots. */
  diffArgs: string[];
}

function commitSource(root: string, commit: string): SnapshotSource {
  return {
    label: commit,
    paths: () => nulSeparated(git(root, ["ls-tree", "-r", "-z", "--name-only", commit])),
    read: (path) => git(root, ["show", `${commit}:${path}`]),
  };
}

function indexSource(root: string): SnapshotSource {
  return {
    label: "index",
    paths: () => nulSeparated(git(root, ["ls-files", "-z"])),
    read: (path) => git(root, ["show", `:${path}`]),
  };
}

function workingTreeSource(root: string): SnapshotSource {
  return {
    label: WORKING_TREE,
    paths: () => {
      const deleted = new Set(nulSeparated(git(root, ["ls-files", "-z", "--deleted"])));
      return nulSeparated(git(root, ["ls-files", "-z"])).filter((path) => !deleted.has(path));
    },
    read: (path) => readFileSync(join(root, path), "utf8"),
  };
}

function emptySource(): SnapshotSource {
  return {
    label: "empty",
    paths: () => [],
    read: (path) => {
      throw new Error(`The empty snapshot has no file ${path}`);
    },
  };
}

/** Boundary commits of a shallow clone: their parents are missing, not absent. */
function shallowCommits(root: string): Set<string> {
  const path = resolve(root, git(root, ["rev-parse", "--git-path", "shallow"]).trim());
  if (!existsSync(path)) return new Set();
  return new Set(readFileSync(path, "utf8").split("\n").filter(Boolean));
}

function resolveCommit(root: string, reference: string): string {
  return git(root, ["rev-parse", "--verify", `${reference}^{commit}`]).trim();
}

function indexMatchesHead(root: string): boolean {
  try {
    execFileSync("git", ["-C", root, "diff", "--cached", "--quiet"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve which two snapshots of the repository at `root` a spec compares.
 * Git failures (unknown reference, missing parent in a shallow clone) and
 * invalid combinations are raised.
 */
export function resolveComparison(root: string, spec: DiffSpec): Comparison {
  if (spec.commit !== undefined) {
    if (spec.reference !== undefined || spec.staged) {
      throw new Error("A single commit cannot be combined with a reference or --staged");
    }
    const commit = resolveCommit(root, spec.commit);
    if (shallowCommits(root).has(commit)) {
      throw new Error(
        `The parent of ${commit} is not available in this shallow clone — fetch more history (git fetch --unshallow)`,
      );
    }
    const parent = git(root, ["rev-list", "--parents", "-n", "1", commit]).trim().split(" ")[1];
    return {
      base: parent ? commitSource(root, parent) : emptySource(),
      head: commitSource(root, commit),
      baseCommit: parent ?? EMPTY_TREE,
      acceptanceBase: parent,
      diffArgs: [parent ?? EMPTY_TREE, commit],
    };
  }
  const range = spec.reference ? /^(.*?)(\.\.\.?)(.*)$/.exec(spec.reference) : null;
  if (range) {
    if (spec.staged) {
      throw new Error(`A commit range (${spec.reference}) cannot be combined with --staged`);
    }
    const from = resolveCommit(root, range[1] || "HEAD");
    const to = resolveCommit(root, range[3] || "HEAD");
    const baseCommit = range[2] === "..." ? git(root, ["merge-base", from, to]).trim() : from;
    return {
      base: commitSource(root, baseCommit),
      head: commitSource(root, to),
      baseCommit,
      acceptanceBase: baseCommit,
      diffArgs: [baseCommit, to],
    };
  }
  if (spec.staged) {
    const baseCommit = resolveCommit(root, spec.reference ?? "HEAD");
    return {
      base: commitSource(root, baseCommit),
      head: indexSource(root),
      baseCommit,
      acceptanceBase: baseCommit,
      diffArgs: ["--cached", baseCommit],
    };
  }
  if (spec.reference) {
    const baseCommit = resolveCommit(root, spec.reference);
    return {
      base: commitSource(root, baseCommit),
      head: workingTreeSource(root),
      baseCommit,
      acceptanceBase: baseCommit,
      diffArgs: [baseCommit],
    };
  }
  const baseCommit = resolveCommit(root, "HEAD");
  return {
    base: indexSource(root),
    head: workingTreeSource(root),
    baseCommit,
    acceptanceBase: indexMatchesHead(root) ? baseCommit : undefined,
    diffArgs: [],
  };
}

/** Repository-relative paths of all files (code and documents) a comparison changes. */
export function changedFiles(root: string, comparison: Comparison): string[] {
  // File names are all the lint needs; -z keeps unusual names unquoted.
  return nulSeparated(
    git(root, ["diff", "--name-only", "-z", "--no-renames", ...comparison.diffArgs, "--"]),
  );
}

/**
 * Documents that Git does not track yet, sorted. They exist in the working
 * tree but are not part of the comparison until added. Empty unless the head
 * of the comparison is the working tree.
 */
export function untrackedDocuments(
  root: string,
  comparison: Comparison,
  isDocument: (path: string) => boolean,
): string[] {
  if (comparison.head.label !== WORKING_TREE) return [];
  return nulSeparated(git(root, ["ls-files", "-z", "--others", "--exclude-standard"]))
    .filter(isDocument)
    .sort((a, b) => a.localeCompare(b));
}
