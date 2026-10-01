# cli42

Code shared by the \*42 documentation CLIs —
[arc42-language](https://github.com/docToolchain/arc42-language) (`arc42`),
[biz42](https://github.com/mrsimpson/biz42) (`biz42`) and
[pdt42](https://github.com/mrsimpson/pdt42) (`pdt42`). All parse Markdown
or AsciiDoc documents with fenced blocks into a workspace of elements, diagrams
and edges; everything here works on that shape without knowing the domain
model. A
language declares what makes it that language — its schemas, diagram kinds,
rules and texts — and the library does the rest.

Published as the npm package **`@cli42/lib`**, one subpath per concern:

| Import                 | Runs in       | Contents                                                                                                                                                                                                                                                     |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@cli42/lib/parser`    | Node, browser | One notation-independent core (headings, prose, `:::blocks` with `key: value` and `key:` + `- item` lists, `:::ignore`, `:::diagram` + source fence, bare Mermaid), configured by a dialect; Markdown and AsciiDoc tokenizers                                |
| `@cli42/lib/notation`  | Node, browser | `NotationAdapter`, `ProseRenderer`, `renderProseNodes`, `parseDocumentAsync` (parse, then render prose), `detectNotation`                                                                                                                                    |
| `@cli42/lib/markdown`  | Node, browser | The Markdown prose renderer (`MarkdownProseRenderer`, `renderMarkdown`, backed by marked) — prose is rendered once, in the backend; raw HTML is shown as text, only web, mail and relative links stay links                                                  |
| `@cli42/lib/asciidoc`  | Node, browser | The AsciiDoc prose renderer (`AsciidocProseRenderer`); loads `@asciidoctor/core` only where imported                                                                                                                                                         |
| `@cli42/lib/cli`       | Node, browser | Command-line conventions of the CLIs: `formatError` (an unknown `--format` value is a usage error), `USAGE_ERROR` (exit code 2)                                                                                                                              |
| `@cli42/lib/schema`    | Node, browser | Zod (re-exported, one version for all languages), list schemas, `CrossRefMeta`, schema introspection, id schemes (`idSchemeOf`, `idMatcher`)                                                                                                                 |
| `@cli42/lib/model`     | Node, browser | `ElementOf<S>` (element types from the schemas), `buildWorkspace` with directive build messages, `buildIndex` from the schemas' cross-references                                                                                                             |
| `@cli42/lib/validator` | Node, browser | Rule and diagnostic types, `createValidator` (rules, syntax check, ignore directives), `GENERIC_CODES`                                                                                                                                                       |
| `@cli42/lib/rules`     | Node, browser | The generic rules every language has (`genericRules`)                                                                                                                                                                                                        |
| `@cli42/lib/mermaid`   | Node          | Node-compatible Mermaid syntax check (`createMermaidParser`, `mermaidSyntaxCheck`); `mermaid` is a peer dependency, loaded on demand                                                                                                                         |
| `@cli42/lib/explain`   | Node, browser | Authoring guidance from the schemas (`blockGuidance`, `formatBlockGuidance`, `formatBlockList`, `ignoreGuidance`)                                                                                                                                            |
| `@cli42/lib/diff`      | Node, browser | Semantic diff of two workspace snapshots (`diffWorkspaces`), its render-ready view (`buildDiffView`), block/prose consistency findings (optionally judged by what changed prose names: `proseRelevance`, from `proseRelevanceOf` in `/model`), change counts |
| `@cli42/lib/git`       | Node          | The two snapshots a `git diff`-style spec compares (`resolveComparison`), changed and untracked files, the files and blobs of a commit, the history of a workspace's documents                                                                               |
| `@cli42/lib/text-diff` | Node, browser | Word-level token diff and `<ins>`/`<del>` marking of rendered HTML                                                                                                                                                                                           |
| `@cli42/lib/vite`      | Node (build)  | `asciidoctorBrowserPaths`: keeps Vite from emitting unused copies of Asciidoctor's browser build                                                                                                                                                             |
| `@cli42/lib/web`       | Node, browser | What every web view shares, without a framework: routes (`parseRoute`, `DocumentRoutes`, `WorkspaceLinks`), the heading `slug`, `groupNodes`, linking ids in rendered prose (`linkIds`), the history format and reading it                                   |
| `@cli42/lib/web-react` | Browser       | The shared React views: `WebViewProvider`, `useTheme`, `useVersion`, `useHistory`, `useSnapshot`, `HistoryChain`, `HistoryEntryView`, `ChangesView`, `ChapterDiff`, `MermaidDiagram`; `styles.css`. `react` and `react-dom` are optional peers               |

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
| WG08 | Element id that does not follow its kind's id scheme                      |

A language adds the rules with its chapter map, file-name convention and fence,
its schemas (for WG08), and its own docs fields:

````ts
const sharedRules = genericRules<ValidationContext>({
  chapters: ELEMENT_CHAPTER,
  chapterOfFile: chapterNumberFromFile,
  fenceFlag: "inArc42Fence",
  fenceDescription: () => "```arc42 fence",
  schemas: ELEMENT_SCHEMAS,
}).map((rule) => ({
  ...rule,
  meta: { ...rule.meta, docs: { ...rule.meta.docs, arc42Chapter: 0 } },
}));
````

## Ids

Each block kind declares how its ids start, in its schema's metadata:

```ts
z.object({ id: z.string(), title: z.string() }).meta({ idPrefixes: ["cap", "capability"] });
z.object({ id: z.string() }).meta({ idPrefixes: ["platform"], bareId: true }); // `platform` itself is an id too
```

The first prefix is the canonical one (templates and guidance use it); further
ones accept what workspaces already use. A kind without `idPrefixes` has no
scheme. The declaration serves everything that recognises ids:

- WG08 warns about an element id without its kind's prefix;
- `idMatcher(schemas, knownIds)` tells whether a token is an id — a language's
  diagram rules use it to find model ids in Mermaid sources;
- `explain` names the scheme ("Id: starts with 'cap-' (or 'capability-')");
- the web view links ids that rendered prose mentions (below).

## Web views

Every \*42 web view routes the same way (`@cli42/lib/web`):

```
#<file>                      a document (its path relative to the workspace)
#<file>:el-<id>              a document, element opened
#<file>:<anchor>             a document, scrolled to a heading (its slug) or another anchor
#changes                     the change summary (serve/build --diff)
#history[:<commit|worktree>[:message]]
?version=<commit>            an earlier version as a whole
```

A link by file name alone still resolves when only one document has that name.
`WorkspaceLinks` builds element and document links from a workspace; pass it to
`linkElementIds(html, links, ownId)` to link the ids prose mentions — known ids
only, whole tokens only, never inside links, code blocks or headings, inline
code only when its whole text is an id. It runs on rendered HTML, after
`markHtmlChanges`, so it serves Markdown and AsciiDoc alike.

The React views of `@cli42/lib/web-react` look the same in every app
(`import "@cli42/lib/web-react/styles.css"`; classes are `c42-<component>-<name>`,
colours come from the app's theme tokens `--bg`, `--text`, `--border`,
`--diff-added` …). A language takes part through a provider:

```tsx
<WebViewProvider
  value={{
    labels: { model: "business model" },        // "No business model changes."
    isBlock: (node) => node.kind === "block" && node.inBiz42Fence,
    renderNodes: (props) => <NodesRender {...props} />, // document nodes, the Documents view's way
  }}
>
  <ChangesView diff={diff} error={null} viewMode="human" elementLink={…} documentLink={…} />
</WebViewProvider>
```

`ChangesView` takes `extensions` for a language's own finding groups (arc42's
code-change groups); `useSnapshot` builds an earlier version with the
language's "files in, model out" loader.

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
`tests/consumer-types.ts` pin every value and type the consumers import;
update them when a consumer starts importing something new. A bug found
downstream gets its regression test here, next to the code that fixes it.

To try a change in a consumer before it is released, override the dependency with a link in the consumer's
`pnpm-workspace.yaml` (`overrides: { "@cli42/lib": "link:../cli42" }`). A link
brings the working copy's own `node_modules/mermaid`, so the web app bundles
Mermaid twice; check bundle sizes with the Git or npm dependency.
