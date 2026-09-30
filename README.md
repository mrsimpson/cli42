# cli42

Code shared by the \*42 documentation CLIs —
[arc42-language](https://github.com/docToolchain/arc42-language) (`arc42`) and
[biz42](https://github.com/mrsimpson/biz42) (`biz42`). Both parse Markdown
or AsciiDoc documents with fenced blocks into a workspace of elements, diagrams
and edges; everything here works on that shape without knowing the domain
model. A
language declares what makes it that language — its schemas, diagram kinds,
rules and texts — and the library does the rest.

Published as the npm package **`@cli42/lib`**, one subpath per concern:

| Import                 | Runs in       | Contents                                                                                                                                                                        |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@cli42/lib/parser`    | Node, browser | One notation-independent core (headings, prose, `:::blocks`, `:::ignore`, `:::diagram` + source fence, bare Mermaid), configured by a dialect; Markdown and AsciiDoc tokenizers |
| `@cli42/lib/notation`  | Node, browser | `NotationAdapter`, `ProseRenderer`, `renderProseNodes`, `parseDocumentAsync` (parse, then render prose), `detectNotation`                                                       |
| `@cli42/lib/markdown`  | Node, browser | The Markdown prose renderer (`MarkdownProseRenderer`, `renderMarkdown`, backed by marked) — prose is rendered once, in the backend                                              |
| `@cli42/lib/asciidoc`  | Node, browser | The AsciiDoc prose renderer (`AsciidocProseRenderer`); loads `@asciidoctor/core` only where imported                                                                            |
| `@cli42/lib/cli`       | Node, browser | Command-line conventions of the CLIs: `formatError` (an unknown `--format` value is a usage error), `USAGE_ERROR` (exit code 2)                                                 |
| `@cli42/lib/schema`    | Node, browser | Zod (re-exported, one version for all languages), list schemas, `CrossRefMeta`, schema introspection                                                                            |
| `@cli42/lib/model`     | Node, browser | `ElementOf<S>` (element types from the schemas), `buildWorkspace` with directive build messages, `buildIndex` from the schemas' cross-references                                |
| `@cli42/lib/validator` | Node, browser | Rule and diagnostic types, `createValidator` (rules, syntax check, ignore directives), `GENERIC_CODES`                                                                          |
| `@cli42/lib/rules`     | Node, browser | The generic rules every language has (`genericRules`)                                                                                                                           |
| `@cli42/lib/mermaid`   | Node          | Node-compatible Mermaid syntax check (`createMermaidParser`, `mermaidSyntaxCheck`); `mermaid` is a peer dependency, loaded on demand                                            |
| `@cli42/lib/explain`   | Node, browser | Authoring guidance from the schemas (`blockGuidance`, `formatBlockGuidance`, `formatBlockList`, `ignoreGuidance`)                                                               |
| `@cli42/lib/diff`      | Node, browser | Semantic diff of two workspace snapshots (`diffWorkspaces`), its render-ready view (`buildDiffView`), block/prose consistency findings, change counts                           |
| `@cli42/lib/git`       | Node          | The two snapshots a `git diff`-style spec compares (`resolveComparison`), changed and untracked files, the files and blobs of a commit, the history of a workspace's documents  |
| `@cli42/lib/text-diff` | Node, browser | Word-level token diff and `<ins>`/`<del>` marking of rendered HTML                                                                                                              |
| `@cli42/lib/vite`      | Node (build)  | `asciidoctorBrowserPaths`: keeps Vite from emitting unused copies of Asciidoctor's browser build                                                                                |

## Generic rule codes

The rules every language has — and the findings of the validation engine
itself — have codes in their own namespace: severity letter, `G` for generic,
two digits. They never collide with a language's own codes (`E002`, `W001`, …).

| Code | Finding                                                                   |
| ---- | ------------------------------------------------------------------------- |
| EG01 | Duplicate element id                                                      |
| EG02 | Block cannot be built (unknown type, missing/invalid attribute, unclosed) |
| EG03 | Element documented outside its canonical chapter                          |
| EG04 | Block not placed under any heading                                        |
| WG01 | Unknown attribute on a block                                              |
| WG02 | Block without prose introduction in its section                           |
| WG03 | More than one block under one heading                                     |
| WG04 | Mermaid fence without `:::diagram` metadata                               |
| WG05 | Block outside the language fence                                          |
| WG06 | Ignore directive that suppressed nothing                                  |
| WG07 | Ignore directive that targets an error                                    |

A language adds the rules with its chapter map, file-name convention and fence,
and its own docs fields:

````ts
const sharedRules = genericRules<ValidationContext>({
  chapters: ELEMENT_CHAPTER,
  chapterOfFile: chapterNumberFromFile,
  fenceFlag: "inArc42Fence",
  fenceDescription: () => "```arc42 fence",
}).map((rule) => ({
  ...rule,
  meta: { ...rule.meta, docs: { ...rule.meta.docs, arc42Chapter: 0 } },
}));
````

## Generic over the language's types

The lib works on structural shapes; results keep the language's own types. The
element union is derived from the schema map, the diff from the workspace
payload:

```ts
import type { ElementOf } from "@cli42/lib/model";
import { diffWorkspaces } from "@cli42/lib/diff";
import type { WorkspaceDiff } from "@cli42/lib/diff";

export type Element = ElementOf<typeof ELEMENT_SCHEMAS>;
export type ArchitectureDiff = WorkspaceDiff<WorkspacePayload>;
// Blocks outside any section are refused (EG04).
export const diff = (base: WorkspacePayload, head: WorkspacePayload): ArchitectureDiff =>
  diffWorkspaces(base, head, { rejectPreambleBlocks: true });
```

## Development

```sh
pnpm install
pnpm run check   # format, lint, type check
pnpm run build   # dist/ — what consumers import
pnpm test        # builds dist/, then runs tests/ against it
```

The tests in `tests/` are black-box: they import only the published subpaths
(`@cli42/lib/<subpath>`, which resolve to `dist/` through the package's own
`exports`), so they exercise exactly what npm consumers get. They drive a small
language, `demo42` (`tests/support/demo42.ts`), wired to the library the way
arc42-language and biz42 wire theirs — dialect, notations, schemas, builder,
index, generic and own rules, validator with Mermaid's syntax check — and cover
the diff and Git access on a throwaway repository. `tests/exports.test.ts` and
`tests/consumer-types.ts` pin every value and type the two consumers import;
update them when a consumer starts importing something new. A bug found
downstream gets its regression test here, next to the code that fixes it.

To try a change in a consumer before it is released, override the dependency with a link in the consumer's
`pnpm-workspace.yaml` (`overrides: { "@cli42/lib": "link:../cli42" }`). A link
brings the working copy's own `node_modules/mermaid`, so the web app bundles
Mermaid twice; check bundle sizes with the Git or npm dependency.
