# Development Plan: cli42 (claude/web-view-modules branch)

*Generated on 2026-09-30 by Vibe Feature MCP*
*Workflow: [epcc](https://codemcp.github.io/workflows/workflows/epcc)*

## Goal

The web view of every *42 CLI links the model ids that its prose mentions, and all three web
views route, render and show changes the same way. Two new subpaths of `@cli42/lib` carry what the
web views share:

- **`@cli42/lib/web`**: framework-free web view logic. It covers hash routing, the heading slug,
  linking id mentions in rendered prose, and the history format.
- **`@cli42/lib/web-react`**: the React components and hooks that arc42-language and biz42 have
  copied from each other. These are the theme, history, changes view, chapter diff and Mermaid
  diagram.

Ids get a scheme: each block kind declares its id prefixes in its schema. A generic rule checks
the scheme, and the prose linker and the diagram rules use the same declaration to recognise ids.

Afterwards pdt42 becomes an ordinary cli42 language. It uses the lib's parser, model, validator,
generic rules, explain and prose rendering. Its web view uses `/web` and `/web-react`, including
the changes and history views it does not have today.

## Key Decisions

- **pdt42 is just another language definition.** No opt-ins for pdt42 in the lib. Where the lib
  lacks something pdt42 needs, the lib grows for every language:
  - `key:` followed by `- item` lines (list values whose items may contain commas);
  - the line of each attribute, so a finding points at the attribute.

  Both are additive. arc42 and biz42 documents do not use `- item` inside blocks (the lib drops
  such lines today, `parser/core.ts:280`). Their ASTs must stay byte-identical, which is verified
  on all documents of both repositories.
- **pdt42 changes its behaviour on purpose, to match the other languages.** Its error codes,
  ignore directives, AST and element shape follow the cli42 way. This is the same step biz42 took
  in the extraction's phase 6 ("adopt the arc42 way"):

  | | pdt42 today | after (harmonized) |
  |---|---|---|
  | Duplicate id | `E001` | `EG01` |
  | Unknown attribute | `E003` (error) | `WG01` (warning) |
  | Invalid attribute value, missing attribute | `E003` | `EG02`, directive message ("problem — what to do") |
  | Unknown block, unreadable line, unclosed block | `E004` | `EG02` |
  | Block without prose | `W001` | `WG02` |
  | Block outside a section, outside the fence, several blocks under one heading | not checked | `EG04`, `WG05`, `WG03` |
  | Wrong chapter for a block | not checked | `EG03`, from the method's step files |
  | `:::ignore CODE` | suppresses the code in the whole file | suppresses one finding at or after its line; `WG06` unused, `WG07` aimed at an error |
  | Ignore code pattern | `[A-Za-z]\d{3}` | any rule code, including `EG01`–`WG08` |
  | Parse errors | `parse-error` nodes in the AST | build issues |
  | Element | attributes under `element.data` | flat (`ElementOf<S>`) |
  | Unresolved reference, singletons, canvases | `E002`, `E005`, `E006` | unchanged: language rules keep their codes |
  | All method rules (`W002`–`W011`, `H…`) | unchanged | unchanged |

  These changes land in separate commits marked **"adopt the cli42 way"**. pdt42 tests change only
  in those commits, and only where they assert one of the behaviours above. The example workspace
  (`examples/harvest-commons`) must stay free of errors and warnings. Where a new generic rule
  flags it, the example is fixed, not the rule.
- **Test policy.** No existing test changes, with two exceptions:
  - biz42: tests that depend on the harmonized routing (see *Notes → Routing today*);
  - pdt42: the "adopt the cli42 way" commits above.

  arc42-language is only refactored. Its unit tests (526) and Playwright suites pass unchanged.
  New tests are added freely, mostly in cli42 as black-box tests of the published subpaths.
- **`/web` is framework-free and knows no language.** It contains plain TypeScript without React.
  It runs in the browser and in Node, because the CLIs import the history format to write and
  serve it. The language supplies what differs, such as its ids (from the schemas) and its
  document extensions.
- **The id scheme lives in `/schema`, not in `/web`.** Validation (the new rule, biz42 `E011`,
  arc42 `E013`) uses it as well as the web view. So the validator never depends on web code.
- **Ids are declared per kind as prefixes: `.meta({ idPrefixes: ["cap", "capability"] })`.**
  - The first prefix is the canonical one, used by templates and guidance.
  - Further prefixes accept what the workspaces use today. arc42 and biz42 declare every prefix
    their documents use, so no new warning appears there (see *Notes → Id prefixes today*).
  - A kind without `idPrefixes` has no scheme. arc42's and biz42's `diagram` ids are names, not
    typed references, and declare none.
  - A singleton kind may allow the bare prefix as its whole id (`platform`):
    `.meta({ idPrefixes: ["platform"], bareId: true })`.
- **New generic rule `WG08`: "Id does not follow its kind's scheme"** (warning, can be ignored).
  It only checks kinds that declare `idPrefixes`. The lib owns the code, like `EG01`–`WG07`.
- **One definition of "this token is an id"** (`idMatcher(schemas)` in `/schema`): a known id of
  the workspace, or a token that carries a declared prefix. It is used in four places:
  - `WG08`, for the ids of blocks;
  - biz42 `E011`, replacing its hard-coded `ELEMENT_PREFIXES`. That list has drifted: it misses
    `cap-`, `prod-`, `sig-`, `impr-` and `cf-`, so those ids are never checked today;
  - arc42 `E013`, replacing "contains a hyphen";
  - the prose linker.
- **Prose linking is a pass over rendered HTML, not over the source.** One function covers
  Markdown and AsciiDoc and keeps the raw prose untouched. It runs in the web view, after the
  diff marking (`markHtmlChanges`), because only the web view holds the whole workspace:
  - It links a token only if it is a **known id** of the workspace. Unknown ids that look like
    ids stay text.
  - It never links inside `<a>`, `<pre>` or headings, nor the element's own id in its own prose.
  - Inside inline `<code>`, it links only when the code's whole text is an id. arc42's docs write
    13 ids in backticks.
  - It links ids only, never titles.
- **One routing scheme for all three web views.** It is today's shared scheme, made explicit:

  ```
  #<file>                      a document
  #<file>:el-<id>              a document, element opened
  #<file>:<slug>               a document, scrolled to a heading or another anchor (canvas id)
  #changes                     the change summary (--diff)
  #history[:<commit|worktree>[:message]]
  ?version=<commit>            an earlier version as a whole (query, not hash)
  ```

  - **`<file>` is the path relative to the workspace**, percent-decoded when read. For a flat
    workspace it is the file name, as today. Only pdt42 uses subfolders.
  - When a link is resolved, a file that doesn't match exactly falls back to the only document
    with that name. That keeps bookmarked and published links of arc42 and biz42 working.
  - An app adds its own views (arc42 `#meta-model`) through the router; the lib does not know
    them.
  - biz42's `#chapter-<n>-<id>` goes away. Its diagram views (`DiagramView`, `BmcDiagram`) build
    the shared element link instead.
- **One heading slug**: `slug()` in `/web`, pdt42's current algorithm. It lowercases, strips
  accents, and replaces runs of non-alphanumerics with `-`. The CLIs' `toSlug` stays: it builds
  GitHub anchors for Markdown output and is not part of the web view.
- **The history format moves to `/web`.** Today it is `packages/web/src/history-format.ts` in
  arc42 and biz42, exported as `@arc42/web/history-format` for the CLI. It is plain TypeScript and
  the same in both apart from names. Both CLIs import it from the lib afterwards.
- **`/web-react` components take the language through props and slots**, not by import:
  - **what is rendered**: a `renderNodes` slot for the language's document nodes (its
    `AstNodeRenderer`, `ElementCard`, diagrams);
  - **words**: `labels` (e.g. `{ model: "architecture" }` or `"business model"`, for "No
    architecture changes.", the history's `aria-label` and similar);
  - **extensions**: extra finding groups in the changes view (arc42's code-change and coverage
    groups);
  - **links**: the element and document links from `/web`.
- **React is an optional peer dependency** (`react`, `react-dom` `^18`). Only `/web-react`
  imports it. `/web` and all other subpaths stay usable without React.
- **Styles ship as one plain stylesheet, `@cli42/lib/web-react/styles.css`.** Class names are
  prefixed (`c42-`) and keep the name the CSS module had (e.g. `c42-mermaid--panning`). The CSS
  uses custom properties that each app's theme defines (colours, fonts, spacing).
  - Rejected: shipping CSS modules. `vp pack` does not emit them reliably, and a consumer's Vite
    dev server would have to process CSS modules inside `node_modules`.
  - arc42's Playwright tests match `toHaveClass(/panning/)` and `/pannable/` on the Mermaid view,
    so the prefixed names keep those words. Sidebars stay in the apps (`/sidebarOpen/`).
- **The frontend is harmonized too; the lib's layout wins.** (Decided during Code, phase 3.)
  The shared components bring their own look (the lib's stylesheet and theme tokens: the `--bg`,
  `--text`, `--border`, `--diff-*`… custom properties arc42 and biz42 already share). An app does
  not keep its former layout of these views through workarounds; where arc42 and biz42 differed
  (fonts, spacing, a hint line), the shared version is used in both. Tests that address elements
  by role, text or `data-testid` are unaffected; class names are not a contract.
- **Scope of `/web-react`**: what is identical or nearly so in arc42 and biz42 (see *Notes → Web
  code shared today*): `useTheme`, `version`, `useHistory`, `useSnapshot`, `HistoryChain`,
  `HistoryEntryView`, `ChangesView`, `ChapterDiff`, `DiffSegment`, `MermaidDiagram`.
  - These stay in the apps: `App`, `Sidebar`, `DocumentView`, `AstNodeRenderer`, `ElementCard`,
    and arc42's `MetaModelView` and `CoverageView`. They show the language's own model.
  - `groupNodes` (consecutive prose and the following block form one run) is shared, because
    all three apps implement it the same way.
- **pdt42 gets everything the lib offers**, including features it lacks today:
  - `pdt42 diff`, `serve --diff` and `build --diff`, with the changes view;
  - `pdt42 history`, `serve` with history and `build --with-history`, with the history view and
    "browse this version";
  - the theme hook, prose linking and id prefixes.

  These are additive, so no pdt42 test changes for them. The canvases stay pdt42's own.
- **Distribution while in progress**: as in the extraction, the consumers pin cli42 to a commit of
  this branch (`github:mrsimpson/cli42#<sha>` in each pnpm catalog, cli42 listed in
  `onlyBuiltDependencies`, built by its `prepare` script). When cli42 is merged and released
  (semantic-release publishes to npm), the catalogs go back to an npm version.
- **Branch `claude/web-view-modules` in all four repositories.** No pull requests unless asked.

## Notes

### Routing today

| | arc42-language | biz42 | pdt42 |
|---|---|---|---|
| Parser | `web/src/App.tsx:40` | `web/src/App.tsx:76` | `web/src/App.tsx:16` |
| File part | file name | file name | path relative to the workspace |
| Anchors | heading slug, `el-<id>` | `el-<id>` only; others dropped | `el-<id>`, canvas id, heading slug |
| Percent-decoding | no | no | yes |
| Other forms | — | `#chapter-<n>-<id>` from diagram clicks, translated on `hashchange` | — |
| Own views | `#changes`, `#history…`, `#meta-model` | `#changes`, `#history…`, `?version=` | — |
| Links built by hand | ~49 places | ~47 places | ~14 places |

Most hand-built links fall back to `#el-${id}` when the file is unknown. Heading slugs come from
different functions: arc42 web `headingAnchor`, pdt42 web `slug`.

biz42 Playwright tests that navigate by hash use file-name routes (`#04-risks.biz42.md`,
`#04-risks.biz42.md:el-risk-commoditisation`, `#history:<sha>`, `?version=<sha>#…`). Its
workspaces are flat, so the relative path equals the file name and they should pass unchanged.
Expected changes: tests that rely on `#chapter-…` or on dropped heading anchors.

### Web code shared today (arc42 vs biz42, differing lines)

| Identical or nearly | Similar | Diverged (stays in the app) |
|---|---|---|
| `useTheme` 0, `textDiff` 0 (already the lib), `version` 4, `useHistory` 8, `HistoryChain` 14, `HistoryEntryView` 19, `ChapterDiff` 20 | `MermaidDiagram` 44, `useSnapshot` 51, `history-format` 53, `DiffSegment` 84, `ChangesView` 127 | `App` 578, `DocumentView` 182, `ElementCard` 178, `Sidebar` 178, `AstNodeRenderer` 293 |

The differences in the first two columns are:
- product words ("architecture" / "business model");
- `import` extensions;
- biz42 passing `diagrams` and a chapter map to the node renderer;
- biz42 marking prose changes per run (`proseHtml[]`) instead of per node;
- arc42's extra finding groups in `ChangesView` (code changed, uncovered paths).

All three web apps use React 18. pdt42 has one global `styles.css` and no CSS modules. arc42 and
biz42 use CSS modules.

### Id prefixes today (block ids in docs and examples)

- **pdt42**: one prefix per kind, no exceptions. `platform` is a bare id.
- **arc42-language**: one prefix per kind, except `deployment-node` (`dn`, `node`, `env`),
  `runtime-scenario` (`rs`, `scenario`) and `diagram` (no scheme).
- **biz42**: one prefix per kind, except `capability` (`cap`, `capability`), `product` (`prod`,
  `product`), `signal` (`sig`, `signal`), `cashflow` (`cf`, `cashflow`) and `diagram` (no scheme).

In pdt42 several prefixes are one letter (`a`, `c`, `e`, `j`, `m`, `n`, `r`, `s`, `t`, `x`). A
word like `x-ray` in prose carries a declared prefix but isn't an id, which is why the linker only
links known ids.

### Prose rendering today

- arc42 and biz42 show `renderedHtml`, rendered once in the backend by `@cli42/lib/markdown`
  (plain `marked`, raw HTML passes through) or `@cli42/lib/asciidoc`.
- pdt42 renders in the browser with its own `marked` instance. It escapes raw HTML and only keeps
  web, mail and relative links.

Harmonizing this is an open question (below).

### Baseline (2026-09-30, `main` of each repository)

- Install with frozen lockfile: all green.
- Unit tests: cli42 189, arc42-language 526, biz42 107, pdt42 63, all passing.
- Build: all green. `vp check`: green except pdt42, where `package.json` has a formatting issue
  on `main`. It gets a separate `chore` commit.
- Playwright suites: not yet run (Explore task).

### Out of scope

- Extracting the CLI shell (command routing, `serve`/`build`, renderers). pdt42's new
  `diff`/`history` commands follow arc42's and biz42's; the shared shell is a follow-up.
- pdt42's canvases and its `canvases/` site page.
- Linking titles in prose.

### Open questions

- **Prose rendering in pdt42.**
  - Recommendation: adopt the lib's backend rendering (`renderedHtml`) and move pdt42's safety
    (escape raw HTML, keep safe URLs only) into `@cli42/lib/markdown` for every language.
  - This changes arc42 and biz42 output for documents with raw HTML in prose. It needs a check
    whether any of their tests or docs rely on raw HTML.
- **The generic rules that pdt42 would newly get** (`EG03` wrong chapter, `WG03` several blocks
  under one heading). Should they be part of pdt42's rule set? Recommendation: yes, for the sake of
  harmonization, with the example fixed where they fire.

## Explore

### Tasks

- [ ] Run the Playwright suites of arc42-language, biz42 and pdt42 on `main` (baseline).
- [ ] Record which arc42/biz42 tests assert the rule list (`rules --format json`), so `WG08` does
  not break them. If they do, `WG08` is only listed where a language declares prefixes.
- [ ] Check that no example or doc of arc42/biz42 gets a new finding from `WG08` or from `E011`
  using all of biz42's prefixes.
- [ ] Check which Playwright tests count links in prose (the linker adds `<a>`).
- [ ] Check `vp pack` with a `.css` asset and a React peer (tsdown); decide how the stylesheet is
  copied to `dist/`.
- [ ] Map pdt42's validator, canvas model and web onto `ElementOf` (every use of `element.data`).

### Completed

- [x] Compare the routing of the three web views.
- [x] Compare the web code of arc42 and biz42 file by file.
- [x] Tally id prefixes per kind in all three repositories.
- [x] Find the existing prefix knowledge (biz42 `E011`, arc42 `E013`, biz42 `SKILL.md`).
- [x] Compare pdt42's parser, model and rules with the lib's.
- [x] Baseline: install, build, check, unit tests.
- [x] Created development plan file.

## Plan

### Implementation sequence

Every phase ends with each affected repository's build, check, unit tests and Playwright suite
green, and the consumers re-pinned to the new cli42 commit.

1. **cli42 `/schema`: id scheme.**
   - `idPrefixes` and `bareId` in the schema metadata, and `idMatcher(schemas)`.
   - `WG08` in `genericRules` (checks only kinds that declare prefixes).
2. **cli42 `/web`.**
   - Routing: `parseRoute`, `formatRoute`, `elementHref`, `headingHref`, `docHref`,
     `resolveDocument` (with the file-name fallback), `versionHref`.
   - `slug`, `groupNodes`.
   - `linkIds(html, { ids, own?, href })`.
   - The history format (from arc42's `history-format.ts`, generalised by the product's words).
3. **cli42 `/web-react`.**
   - The shared hooks and components with slots, labels and extensions, plus `styles.css` with
     `c42-` classes and theme custom properties.
   - React as an optional peer.
4. **arc42-language adopts `/web` and `/web-react`.**
   - Pure refactoring: the CLI imports the history format from the lib.
   - Its CSS modules for the moved components go; its theme defines the lib's custom properties.
   - No test changes.
5. **biz42 adopts `/web` and `/web-react`.**
   - Same as arc42, plus the harmonized routing: `#chapter-…` goes, and heading anchors work.
   - Routing tests change only if they depend on either.
6. **arc42 and biz42 declare their id prefixes; the web views link ids.**
   - `E011` and `E013` use `idMatcher`. For biz42's `E011` this is a fix: it now checks
     `cap-`, `prod-`, `sig-`, `impr-` and `cf-` ids.
   - Both apps run `linkIds` on prose.
7. **cli42 parser: `- item` lists and attribute lines.**
   - Additive. The ASTs of all arc42/biz42 documents stay byte-identical.
8. **pdt42 adopts the cli42 way** (separate commits, tests may change here only):
   1. `vp check` formatting fix (`chore`, before anything else);
   2. dialect and Markdown notation adapter on the lib's parser; `parseMarkdown` stays as a
      wrapper;
   3. schemas through `/schema` (`z` from the lib; pdt42 drops its `zod` dependency); element
      types from `ElementOf`; `buildWorkspace` and `buildIndex` from the schemas' `crossRefs`;
   4. `createValidator` with `genericRules` and pdt42's own rules; codes and ignore semantics as
      in *Key Decisions*; the example stays clean;
   5. `explain` and guidance from the lib's schema introspection, where it matches pdt42's `guide`;
   6. prose rendered in the backend (depending on the open question).
9. **pdt42 web adopts `/web` and `/web-react`.**
   - Routing, theme, prose linking and id prefixes (with `WG08`).
   - New commands: `pdt42 diff`, `pdt42 history`, `serve --diff`, `build --diff` and
     `build --with-history`, with the changes and history views and browse-this-version.
     pdt42's `workspace` loading gets a files-in, model-out function like arc42's
     `loadWorkspaceFromFiles`.
10. **Docs.**
    - cli42 README: the subpath table, and a section on ids and web views.
    - arc42 and biz42 architecture docs (`docs/arc42`, chapter 5 Web Renderer, chapter 9 a
      decision on the shared web view): accurate, and validated with their own CLIs.
    - pdt42 README and `SKILL.md`: codes, ignore semantics, id prefixes, the new commands.

### Tests (black-box per phase, new tests only unless stated)

- **cli42 `/schema`:**
  - `WG08` fires for a wrong prefix, not for a declared further prefix or a kind without a
    scheme, and not for a bare singleton id.
  - `idMatcher` accepts known ids and declared prefixes.
- **cli42 `/web`:**
  - Every route form parses and formats back (round trip); percent-decoding works.
  - The file-name fallback works, and fails for ambiguous names.
  - `linkIds` links known ids only, and skips `<a>`, `<pre>`, headings and the element's own id.
    In inline `<code>` it links only a whole id. It keeps markup well-formed with `<ins>`/`<del>`
    present.
  - `slug` gives the same results as pdt42's slug.
- **cli42 `/web-react`:** components rendered with `react-dom/server` (no DOM):
  - labels and slots appear;
  - the changes view shows an extension group;
  - `HistoryChain` lists pearls newest first.
- **cli42 parser:** `- item` lists and attribute lines on Markdown and AsciiDoc. The demo42
  language covers them.
- **arc42-language:** existing unit and Playwright suites, unchanged. A new Playwright test: an id
  in prose is a link that opens the element.
- **biz42:**
  - Existing suites; routing tests adjusted if needed (see above).
  - New Playwright tests: a diagram node link opens the element; an id in prose is a link.
- **pdt42:**
  - Existing tests, except the "adopt the cli42 way" commits.
  - New tests: `diff` and `history` commands (CLI), the changes and history views (Playwright,
    on a throwaway Git repository as in arc42/biz42), prose links, `WG08` on the example
    (none).

### Completed

- [x] Sequence the work so each phase keeps every suite green.

## Code

### Tasks

- [ ] Phase 1: cli42 id scheme and `WG08`.
- [ ] Phase 2: cli42 `/web`.
- [ ] Phase 3: cli42 `/web-react`.
- [ ] Phase 4: arc42-language adopts `/web`, `/web-react`.
- [ ] Phase 5: biz42 adopts `/web`, `/web-react`, harmonized routing.
- [ ] Phase 6: id prefixes in arc42 and biz42; `E011`/`E013` on `idMatcher`; prose linking on.
- [ ] Phase 7: cli42 parser lists and attribute lines.
- [ ] Phase 8: pdt42 adopts the cli42 way (separate commits).
- [ ] Phase 9: pdt42 web on `/web`, `/web-react`; diff and history.
- [ ] Phase 10: docs in all four repositories.
- [ ] After each phase: compare CLI output (`validate`, `get`, `diff`, `rules`, `explain` on docs
  and examples) with the pre-phase build. Differences must be intended and recorded here.

### Completed

*None yet.*

## Commit

### Tasks

- [ ] Per phase: one commit in cli42 and one commit per consumer (Conventional Commits; body with
  Intent / Key decisions / Side effects).
- [ ] pdt42's behaviour changes in separate commits marked "adopt the cli42 way".
- [ ] Merge cli42 first; after its release, switch the consumers' catalog entry to the npm version.
- [ ] Pull requests only when asked.

### Completed

- [x] Commit this plan.
