# cli42

Code shared by the \*42 documentation CLIs —
[arc42-language](https://github.com/docToolchain/arc42-language) (`arc42`) and
[biz42](https://github.com/mrsimpson/biz42) (`biz42`). Both parse Markdown
documents with fenced blocks into a workspace of elements, diagrams and edges;
everything here works on that shape without knowing the domain model.

Published as the npm package **`@cli42/lib`**, one subpath per concern:

| Import                 | Runs in       | Contents                                                                                                                                                                                                |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@cli42/lib/diff`      | Node, browser | Semantic diff of two workspace snapshots (`diffWorkspaces`), its render-ready view (`buildDiffView`), block/prose consistency findings, change counts                                                   |
| `@cli42/lib/git`       | Node          | Git access: the two snapshots a `git diff`-style spec compares (`resolveComparison`), changed and untracked files, the files and blobs of a commit, the first-parent history of a workspace's documents |
| `@cli42/lib/text-diff` | Node, browser | Word-level token diff and `<ins>`/`<del>` marking of rendered HTML                                                                                                                                      |

## The workspace shape

The diff is generic over the CLI's own workspace payload. A payload only has to
be structurally compatible with `WorkspaceSnapshot`:

```ts
interface WorkspaceSnapshot {
  documents: { filePath: string; nodes: DiffAstNode[] }[]; // heading, prose, block, diagram, bare-mermaid, ignore
  elements: { id: string; kind: string; loc: { file: string; line: number } }[];
  diagrams: { id: string; loc: { file: string; line: number } }[];
  edges: { from: string; relation: string; to: string }[];
}
```

The result types keep the CLI's types (`WorkspaceDiff<WorkspacePayload>`,
`DiffView<WorkspacePayload>`), so a CLI re-exports them under its own names:

```ts
import { diffWorkspaces } from "@cli42/lib/diff";
import type { WorkspaceDiff } from "@cli42/lib/diff";

export type ArchitectureDiff = WorkspaceDiff<WorkspacePayload>;
// arc42 forbids blocks outside any section (rule E017).
export const diff = (base: WorkspacePayload, head: WorkspacePayload): ArchitectureDiff =>
  diffWorkspaces(base, head, { preambleBlockRule: "E017" });
```

What differs between the CLIs is passed in: the file extensions of documents,
the rule that forbids blocks in a preamble, whether section contents carry
their diagrams.

## Development

```sh
pnpm install
pnpm run check   # format, lint, type check
pnpm run build   # dist/ — what consumers import
```

The behavior is covered by the test suites of arc42-language and biz42, which
exercise every export through their CLIs. To try a change there before it is
released, link the working copy into a consumer package:

```sh
pnpm add @cli42/lib@link:../../../cli42   # in e.g. arc42-language/packages/core
```
