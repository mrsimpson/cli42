// Git access as the CLIs' workspace adapters use it (@arc42/workspace-fs,
// @biz42/workspace-fs): the snapshots a diff spec compares, changed and
// untracked files, the files and blobs of a commit, the document history —
// and the whole `diff` pipeline on a real repository.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { consistencyFindings, diffWorkspaces } from "@cli42/lib/diff";
import {
  EMPTY_TREE,
  WORKING_TREE,
  changedFiles,
  commitDiffSpec,
  errorMessage,
  gitLsFiles,
  listDocumentHistory,
  readCommitFiles,
  readDocumentBlob,
  resolveComparison,
  untrackedDocuments,
  workspaceLocation,
} from "@cli42/lib/git";
import type { SnapshotSource } from "@cli42/lib/git";
import { NOTATIONS, block, isDocument, loadWorkspaceFromFiles, md } from "./support/demo42.ts";

const DOC = "docs/02-services.demo42.md";
const EXTENSIONS = Object.values(NOTATIONS).map((notation) => notation.fileExtension);

let root: string;
const commits: string[] = [];

function git(...args: string[]): string {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Ada",
      GIT_AUTHOR_EMAIL: "ada@example.com",
      GIT_COMMITTER_NAME: "Ada",
      GIT_COMMITTER_EMAIL: "ada@example.com",
    },
  }).trim();
}

function write(path: string, content: string) {
  mkdirSync(join(root, path, ".."), { recursive: true });
  writeFileSync(join(root, path), content);
}

function commit(message: string): string {
  git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-q", "-m", message);
  const id = git("rev-parse", "HEAD");
  commits.push(id);
  return id;
}

const services = (title: string, prose = "The A service.") =>
  md("# Services", "## A", prose, ...block("service", { id: "a", title, status: "live" }));

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "cli42-git-")));
  git("init", "-q", "-b", "main");
  write(DOC, services("A"));
  write("src/app.ts", "export {};\n");
  commit("docs: add services");
  write(DOC, services("A2", "The A service, renamed."));
  commit("docs: rename A\n\nBecause *reasons*.");
  write("src/app.ts", "export const x = 1;\n");
  commit("feat: code only");
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const paths = (source: SnapshotSource) => source.paths().filter(isDocument);

describe("workspaceLocation", () => {
  test("finds the repository and tells which paths belong to the workspace", () => {
    const { root: found, inWorkspace } = workspaceLocation(join(root, "docs"));
    expect(found).toBe(root);
    expect(inWorkspace(DOC)).toBe(true);
    expect(inWorkspace("src/app.ts")).toBe(false);
    expect(inWorkspace("docs-old/x.demo42.md")).toBe(false);
  });

  test("the repository root holds every path", () => {
    expect(workspaceLocation(root).inWorkspace("src/app.ts")).toBe(true);
  });

  test("raises outside a repository", () => {
    const outside = mkdtempSync(join(tmpdir(), "cli42-nogit-"));
    try {
      expect(() => workspaceLocation(outside)).toThrow(/Git command failed/);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("gitLsFiles", () => {
  test("lists tracked paths relative to the root", () => {
    expect(gitLsFiles(root).sort()).toEqual([DOC, "src/app.ts"]);
  });
});

describe("resolveComparison", () => {
  test("{ commit } compares a commit with its first parent", () => {
    const comparison = resolveComparison(root, { commit: commits[1]! });
    expect(comparison.base.label).toBe(commits[0]);
    expect(comparison.head.label).toBe(commits[1]);
    expect(comparison.baseCommit).toBe(commits[0]);
    expect(comparison.acceptanceBase).toBe(commits[0]);
    expect(comparison.head.read(DOC)).toContain("title: A2");
    expect(comparison.base.read(DOC)).toContain("title: A\n");
  });

  test("a root commit is compared with the empty tree", () => {
    const comparison = resolveComparison(root, { commit: commits[0]! });
    expect(comparison.base.label).toBe("empty");
    expect(comparison.base.paths()).toEqual([]);
    expect(comparison.baseCommit).toBe(EMPTY_TREE);
    expect(comparison.acceptanceBase).toBeUndefined();
  });

  test("a single commit cannot be combined with a reference or --staged", () => {
    expect(() => resolveComparison(root, { commit: commits[1]!, reference: "HEAD" })).toThrow(
      "A single commit cannot be combined with a reference or --staged",
    );
  });

  test("a..b compares two commits; a...b starts at their merge base", () => {
    const range = resolveComparison(root, { reference: `${commits[0]}..${commits[2]}` });
    expect([range.base.label, range.head.label]).toEqual([commits[0], commits[2]]);
    const symmetric = resolveComparison(root, { reference: `${commits[0]}...HEAD` });
    expect(symmetric.baseCommit).toBe(commits[0]);
  });

  test("a range cannot be combined with --staged", () => {
    expect(() => resolveComparison(root, { reference: "HEAD~1..HEAD", staged: true })).toThrow(
      /cannot be combined with --staged/,
    );
  });

  test("{} compares the index with the working tree, anchored at HEAD", () => {
    const comparison = resolveComparison(root, {});
    expect([comparison.base.label, comparison.head.label]).toEqual(["index", WORKING_TREE]);
    expect(comparison.baseCommit).toBe(commits[2]);
    expect(comparison.acceptanceBase).toBe(commits[2]);
  });

  test("{ staged } compares HEAD with the index; { reference } a commit with the working tree", () => {
    const staged = resolveComparison(root, { staged: true });
    expect([staged.base.label, staged.head.label]).toEqual([commits[2], "index"]);
    const reference = resolveComparison(root, { reference: commits[0]! });
    expect([reference.base.label, reference.head.label]).toEqual([commits[0], WORKING_TREE]);
  });

  test("an unknown reference is raised", () => {
    expect(() => resolveComparison(root, { reference: "no-such-branch" })).toThrow(
      /Git command failed/,
    );
  });
});

describe("changedFiles", () => {
  test("lists every file a comparison changes, code included", () => {
    expect(
      changedFiles(root, resolveComparison(root, { reference: `${commits[0]}..HEAD` })).sort(),
    ).toEqual([DOC, "src/app.ts"]);
    expect(changedFiles(root, resolveComparison(root, { commit: commits[2]! }))).toEqual([
      "src/app.ts",
    ]);
  });
});

describe("working tree and index", () => {
  afterAll(() => {
    git("reset", "-q", "--hard", "HEAD");
    git("clean", "-q", "-fd");
  });

  test("see uncommitted, staged and untracked documents", () => {
    write(DOC, services("A3"));
    write("docs/03-teams.demo42.md", md("# Teams"));
    const unstaged = resolveComparison(root, {});
    expect(unstaged.head.read(DOC)).toContain("title: A3");
    expect(unstaged.base.read(DOC)).toContain("title: A2");
    expect(untrackedDocuments(root, unstaged, isDocument)).toEqual(["docs/03-teams.demo42.md"]);
    // Untracked documents are no part of any snapshot until added.
    expect(paths(unstaged.head)).toEqual([DOC]);

    git("add", DOC);
    const staged = resolveComparison(root, { staged: true });
    expect(staged.head.read(DOC)).toContain("title: A3");
    // With a staged change the index differs from HEAD: no commit describes the base.
    expect(resolveComparison(root, {}).acceptanceBase).toBeUndefined();
    // Only a working-tree head has untracked documents.
    expect(untrackedDocuments(root, staged, isDocument)).toEqual([]);
  });

  test("a deleted file is gone from the working tree snapshot", () => {
    rmSync(join(root, DOC));
    expect(paths(resolveComparison(root, {}).head)).toEqual([]);
  });
});

describe("readCommitFiles and readDocumentBlob", () => {
  test("read the documents of a commit as blob ids, and every path", () => {
    const { files, paths: all } = readCommitFiles(root, commits[1]!, isDocument);
    expect(Object.keys(files)).toEqual([DOC]);
    expect(files[DOC]).toMatch(/^[0-9a-f]{40}$/);
    expect(all.sort()).toEqual([DOC, "src/app.ts"]);
  });

  test("take a full commit id only", () => {
    expect(() => readCommitFiles(root, "HEAD", isDocument)).toThrow("Not a full commit id: HEAD");
  });

  test("read a document blob of the history, and refuse any other blob", () => {
    const { files } = readCommitFiles(root, commits[1]!, isDocument);
    expect(
      readDocumentBlob(root, [commits[1]!], files[DOC]!, isDocument, "Not a document"),
    ).toContain("title: A2");
    const code = git("rev-parse", `${commits[1]}:src/app.ts`);
    expect(() => readDocumentBlob(root, [commits[1]!], code, isDocument, "Not a document")).toThrow(
      `Not a document: ${code}`,
    );
  });
});

describe("listDocumentHistory", () => {
  test("lists the first-parent commits that touched documents, newest first", () => {
    const history = listDocumentHistory(root, EXTENSIONS);
    expect(history.root).toBe(root);
    expect(history.commits.map((c) => [c.commit, c.parent, c.subject, c.body, c.author])).toEqual([
      [commits[1], commits[0], "docs: rename A", "Because *reasons*.", "Ada"],
      [commits[0], null, "docs: add services", "", "Ada"],
    ]);
    expect(history.commits[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("leads with the uncommitted changes when there are any", () => {
    write(DOC, services("A4"));
    try {
      const [uncommitted] = listDocumentHistory(root, EXTENSIONS).commits;
      expect(uncommitted).toMatchObject({
        commit: null,
        parent: commits[2],
        subject: "Uncommitted changes",
      });
      expect(commitDiffSpec(uncommitted!)).toEqual({ reference: "HEAD" });
    } finally {
      git("checkout", "-q", "--", DOC);
    }
  });

  test("a commit's diff spec compares it with its parent", () => {
    expect(commitDiffSpec({ commit: commits[1]! })).toEqual({ commit: commits[1] });
  });

  test("errorMessage reads errors and anything else", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
  });
});

describe("the diff pipeline", () => {
  // What `arc42 diff <commit>` / `biz42 diff <commit>` do: resolve the
  // comparison, load both snapshots from Git, diff and lint them.
  async function snapshot(source: SnapshotSource, inWorkspace: (path: string) => boolean) {
    const files = source
      .paths()
      .filter((path) => isDocument(path) && inWorkspace(path))
      .sort((a, b) => a.localeCompare(b));
    return loadWorkspaceFromFiles(files.map((path) => ({ path, content: source.read(path) })));
  }

  test("a commit that changed block and prose together has no findings", async () => {
    const { root: repository, inWorkspace } = workspaceLocation(join(root, "docs"));
    const comparison = resolveComparison(repository, commitDiffSpec({ commit: commits[1]! }));
    const diff = diffWorkspaces(
      await snapshot(comparison.base, inWorkspace),
      await snapshot(comparison.head, inWorkspace),
      { rejectPreambleBlocks: true },
    );
    expect(diff.elements).toMatchObject([
      { id: "a", status: "modified", proseChanged: true, section: { file: DOC } },
    ]);
    expect(consistencyFindings(diff.elements)).toEqual([]);
  });

  test("the root commit adds every element", async () => {
    const { root: repository, inWorkspace } = workspaceLocation(root);
    const comparison = resolveComparison(repository, { commit: commits[0]! });
    const diff = diffWorkspaces(
      await snapshot(comparison.base, inWorkspace),
      await snapshot(comparison.head, inWorkspace),
    );
    expect(diff.elements.map((change) => [change.id, change.status])).toEqual([["a", "added"]]);
  });
});
