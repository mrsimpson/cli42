# Development Plan: cli42 (claude/extract-shared-code-cli42-acarwb branch)

*Generated on 2026-09-29 by Vibe Feature MCP*
*Workflow: [epcc](https://codemcp.github.io/workflows/workflows/epcc)*

## Goal
Remove the code duplicated between arc42-language (`arc42`) and biz42 (`biz42`) by extracting it into
this repository, published as the npm package `@cli42/lib`. First the diff feature (semantic workspace
diff, Git snapshots/history, text diff — about 1,400 duplicated lines), then the language engine both
CLIs share: parsing and notations, AST, building the model from Zod schemas, reference index,
validation engine, generic rules and `explain`. A future *42 language should only need to declare its
schemas, rules and texts.

## Key Decisions
- One repository, one package `@cli42/lib`, one subpath export per concern (`/diff`, `/git`,
  `/text-diff`, later `/schema`, `/parser`, `/notation`, `/model`, `/validator`, `/mermaid`,
  `/explain`). Browser code never pulls in the Node-only Git helpers.
- Built with the same toolchain as the consumers (vite-plus: `vp pack`, `vp check`, `vp test`).
  Only `dist/` is exported — no `development` condition — so a consumer behaves the same whether the
  package comes from npm, Git or a link.
- Until `@cli42/lib` is published to npm, consumers use a Git dependency pinned to a commit
  (`github:mrsimpson/cli42#<sha>` in the pnpm catalog). It is built by its `prepare` script, so it is
  listed in `onlyBuiltDependencies`. Switch the catalog entry to an npm version once published.
- The CLIs bundle the lib (`alwaysBundle`), so the published CLIs gain no runtime dependency.
- Consumers keep thin, typed wrappers with their existing public names (`ArchitectureDiff`,
  `readArchitectureBlob`, `BusinessModelDiff`, …), so every public API and test import stays stable.
- Generics over the concrete workspace payload: the lib works on a structural shape
  (`WorkspaceSnapshot`); results keep the consumer's element, edge, node and diagram types
  (`WorkspaceDiff<WorkspacePayload>`). For the language engine, element types are derived from the
  schema map instead of being declared twice:
  `ElementOf<S> = { [K in keyof S]: z.infer<S[K]> & { kind: K; loc: SourceLocation } }[keyof S]`.
- Differences are parameters, not forks: `preambleBlockRule` (arc42 E017), `sectionDiagrams`
  (biz42), document extensions, the document predicate for commit files, rule codes, fence names.
- A language is declared once (`defineLanguage({ name, fences, notations, elements, diagrams,
  chapters, ignore, rules, messages })`); the lib builds the pipeline from it.
- **Prefer the arc42 way** (in ideas, not necessarily in code) wherever the two repos differ:
  notation adapters, schema-validated diagram kinds, one fence per language plus W016, E017 (no
  blocks outside a section), prose rendered by the notation's renderer in core (async pipeline),
  "files in, model out", schemas as the single source of truth, ESLint-style rule metadata.
- Coverage, path evidence, `.arc42ignore` and the code-change diff findings are unique to code and
  stay in arc42. They plug in through arc42's own payload type, its own validation context (the lib's
  `Rule` is generic over the context) and its own diff lint.
- Zod is a regular dependency of `@cli42/lib` and re-exported (`@cli42/lib/schema`); arc42 and biz42
  drop their own `zod` dependency. Schema author and schema reader must share one Zod version, and
  the version then lives in one place. The lib's API is tied to Zod's major version anyway, because
  schemas are what a language passes in.
- Validation messages are generated from the schemas (enum values from Zod) instead of hand-written
  special cases, and are directive: **"problem — what to do"**, e.g.
  `Missing required attribute 'type' on actor — add it with one of: person, system`.
  Minor harmonization of wording is accepted. A package that needs its own names wraps the generic
  messages in a message mapper (part of its language definition).
- Test policy: arc42-language is only refactored — no test changes. biz42 is first refactored without
  test changes; adopting the arc42 way (async, E017, W016, diagram kinds, one fence) changes biz42
  behavior and may change its tests, but only in separate, explicitly marked commits
  ("adopt the arc42 way"), kept apart from pure refactoring.
- Work on branch `claude/extract-shared-code-cli42-acarwb` in all three repositories. No pull
  requests unless asked.

## Notes
- Exploration measured the overlap per file. Near-identical: `workspace-diff.ts` (540 lines, 35
  differing), `diff-view.ts` (302/21), `diff-snapshots.ts` (250/59), `history.ts` (152/50),
  `git-diff.ts`, `snapshot.ts`, `textDiff.ts` (204/0), the Mermaid package, the validation engine
  (`validator/index.ts` 97/21, `validator/types.ts`), ignore-directive handling (differs only in the
  rejected-ignore code W030 vs W020), the builder algorithm, the resolver scaffolding, generic rules
  (duplicate id 4 of 37 lines differ, block without prose 12/65, several blocks under one heading
  14/68, unknown attribute 8/29).
- Core sizes: arc42 about 8,900 lines, biz42 about 4,300; the pipeline is the same, the model differs.
- Domain-specific and staying where they are: arc42's deployment/sequence/building-block/context
  diagram rules (E010, E012–E014, H015–H022, W019–W028), coverage (H014, H020, H021, E011, W012,
  W018), AsciiDoc parser (may move later); biz42's SIPOC, turtle, strategy-map and BMC rules.
- The two Markdown parsers have drifted: biz42 accepts an `arc42` fence and a yaml fence for BMC,
  recognises `:::diagram` outside any fence, starts a diagram's source only at a `mermaid`/`yaml`
  fence (other lines in between are skipped), treats only exact ```mermaid as a bare fence, checks
  source fences before open blocks, and drops a `:::diagram` without source at the end of a file.
  arc42's parser is the base; switching biz42 is a behavior change and part of phase 6.
- The resolvers are long if-chains per element kind, while both schema sets already declare
  `crossRefs` metadata (`field`, `targetKind`, `cardinality`). Adding `relation` and `direction`
  lets the lib derive the edges (e.g. arc42's `interface.provider` is a reversed `provides` edge).
  arc42's derived interface edges stay an arc42 extension of the index.
- The builder's hand-written enum messages carry comments "for test compat", but no test asserts
  them; the only asserted message is `Missing required attribute 'id'`, which the directive format
  keeps as its prefix.
- arc42 parses asynchronously (AsciiDoc, prose rendering), biz42 synchronously; the arc42 way makes
  the lib pipeline async. biz42 renders prose and commit messages in the browser; the arc42 way
  renders them in core/on the server.
- Rule docs use `arc42Chapter` / `biz42Chapter`. Instead of renaming them, the lib's `RuleMeta` and
  `Rule` are generic over the docs type: each language extends the lib's `RuleDocs` with its own
  chapter field, so `rules --format json` output and all rule files stay unchanged.
- Open question for the user: arc42's `quality-goal.scenario` is a declared cross-reference that
  was never indexed, so E002 does not check it. Phase 3 keeps that (no `relation`).
- Later, out of scope for now: the CLI shell (about half of `cli.ts` is shared: command routing,
  validate/get/rules/diff/serve/build/history, text/markdown/JSON renderers) and the React diff and
  history components (`DiffSegment`, `ChangesView`, `HistoryChain`, CSS modules).
- Local verification of Playwright suites: the preinstalled headless shell (build 1194) is older than
  Playwright 1.63 expects (1243); point `PLAYWRIGHT_BROWSERS_PATH` at a scratch directory whose
  `chromium_headless_shell-1243/chrome-headless-shell-linux64/` links to the installed build.

## Explore
### Tasks
- [x] Compare all files the two repositories have in common (lines, differing lines).
- [x] Establish the baseline: install, build, check, unit tests (arc42 496, biz42 88) and Playwright
  suites green before any change.
- [x] Read the diff engine, diff view, diff lint, Git snapshot/commit/history code of both repos.
- [x] Decide distribution (Git dependency pinned to a commit until npm publication).
- [x] Explore parsing, notations, AST, builder, schemas, resolver, validation engine, generic rules,
  explain and Mermaid boundary of both repos for the second extraction.
- [x] Identify what must be injected per language and where generics pay off.

### Completed
- [x] Created development plan file

## Plan
### Tasks
- [x] Phase 0 (done): extract diff, Git and text diff; consumers keep wrappers.
- [x] Agree on the language-definition approach, arc42 way, coverage staying in arc42, Zod as a
  regular re-exported dependency, directive messages with message mappers, test policy.
- [x] Phase 1: validation engine, rule types, ignore handling, Mermaid boundary.
- [x] Phase 2: Zod re-export, schema-derived element types, builder with directive messages.
- [x] Phase 3: resolver derived from `crossRefs` (+ `relation`, `direction`).
- [x] Phase 4: parser, AST and notation adapters (arc42's parser as base).
- [ ] Phase 5: generic rule factories and `explain`.
- [ ] Phase 6 (biz42 only, separate commits): adopt the arc42 way.

### Design
- `@cli42/lib/diff` — `diffWorkspaces(base, head, { preambleBlockRule })`,
  `buildDiffView(base, head, diff, { sectionDiagrams })`, `consistencyFindings`, `changeCounts`,
  `isSemanticChange`; generic over `W extends WorkspaceSnapshot`.
- `@cli42/lib/git` — `git`, `gitLsFiles`, `workspaceLocation`, `resolveComparison(root, spec)`,
  `changedFiles`, `untrackedDocuments`, `readCommitFiles(dir, commit, isDocument)`,
  `readDocumentBlob(…, refusal)`, `listDocumentHistory(dir, extensions)`, `commitDiffSpec`.
  Snapshot loading stays in each CLI (it knows how to build its payload).
- `@cli42/lib/text-diff` — word diff and `<ins>`/`<del>` marking of rendered HTML.
- `@cli42/lib/validator` — `Rule<W, I, C>`, `Diagnostic`, `Severity`, `RuleMeta` (with `chapter`),
  `createValidator({ rules, ignore: { staleCode, errorCode }, syntax? })`: runs rules, the optional
  diagram syntax check with suppression of follow-up findings, and ignore directives assigned in
  source order.
- `@cli42/lib/mermaid` — the Node-compatible syntax boundary with injected notation aliases;
  `mermaid` stays external in the CLI bundles.
- `@cli42/lib/schema` — re-exported `z`, `splitListSchema`, `CrossRefMeta` (with `relation`,
  `direction`), `ElementOf<S>`, metadata readers.
- `@cli42/lib/model` — `buildWorkspace(documents, language)` → `Workspace<E, D>`; directive
  messages from the schemas as structured issues (`missing-attribute`, `invalid-value`,
  `unknown-attribute`, `unknown-block`) with a default text, optionally mapped by the language;
  `buildIndex(workspace, language, extend?)` → `ReferenceIndex<E, R> & X`.
- `@cli42/lib/parser`, `@cli42/lib/notation` — Markdown scanner (headings, prose, comments,
  `:::block`, `:::ignore`, `:::diagram` metadata plus source fence, bare Mermaid) with injected fence
  names and a diagram-node factory; `AstNode<D>`; `NotationAdapter`, `detectNotation`,
  `parseWorkspaceFiles`, `loadWorkspaceFromFiles` (async, prose rendered at parse time).
- Generic rule factories: duplicate id, unresolved reference, parse error, unknown attribute, block
  without prose, several blocks under one heading, bare Mermaid, element in wrong chapter, block
  outside section (E017), block outside fence (W016) — each taking its code and chapter map.
- `@cli42/lib/explain` — element and ignore-directive docs from schema metadata.

### Completed
- [x] Phase 0 designed and agreed.
- [x] Language engine proposal agreed (decisions above).

## Code
### Tasks
- [x] Phase 0: `@cli42/lib` package skeleton (vite-plus, TypeScript, CI workflow, README).
- [x] Phase 0: generic `diffWorkspaces`, `buildDiffView`, consistency findings.
- [x] Phase 0: Git comparison, commit files, history.
- [x] Phase 0: text diff.
- [x] Phase 0: arc42-language core, workspace-fs and web use the lib; CLI bundles it.
- [x] Phase 0: biz42 core, workspace-fs and web use the lib; CLI bundles it.
- [x] Phase 0: Git dependency pinned to cli42 commit `185a24c`, `onlyBuiltDependencies`.
- [x] Phase 1: validation engine, rule types, ignore handling, Mermaid boundary.
- [x] Phase 2: Zod re-export (consumers drop `zod`), schema-derived types, builder, directive
  messages, message mappers.
- [x] Phase 3: resolver from `crossRefs`.
- [x] Phase 4: parser, AST, notation adapters (arc42; biz42 switches in phase 6).
- [ ] Phase 5: generic rule factories, `explain`.
- [ ] Phase 6: biz42 adopts the arc42 way (separate commits; tests may change there only):
  the shared Markdown parser (one `biz42` fence, `:::diagram` only inside it, any source fence,
  diagram without source kept), notation adapter with prose rendered in core (async pipeline),
  E017, W016, diagram kinds with their own syntax codes.
- [ ] After each phase: re-pin the consumers to the new cli42 commit.
- [ ] After each phase: compare CLI output (validate/get/diff/rules/explain on docs and examples)
  with the pre-phase build; keep each repo's own architecture docs (`docs/arc42`) accurate.
- [ ] At the end: document `@cli42/lib` as a shared dependency in both repos' architecture docs.

### Completed
- [x] Phase 4: `@cli42/lib/parser` is arc42's Markdown parser, generalised by a dialect (fence info
  strings, the block's fence-flag name, a diagram-node factory receiving the raw `:::diagram`
  attributes); `@cli42/lib/notation` holds `NotationAdapter<N, Doc>`, `Parser<Doc>`,
  `ProseRenderer`, `renderProseNodes` and `detectNotation`. arc42's AST reuses the shared node types;
  its diagram-node factory is shared by its Markdown and AsciiDoc parsers (the AsciiDoc parser stays
  in arc42). The unclosed-block message is directive ("— add the closing ':::'"). biz42's parser
  differs in behavior (see Notes), so biz42 switches in phase 6. Verified: build, check, unit tests,
  Playwright, byte-identical CLI output, and byte-identical ASTs of all 51 arc42 documents (39
  Markdown, 12 AsciiDoc) against the pre-phase parser.
- [x] Phase 3: `buildIndex(elements, schemas)` in `@cli42/lib/model` derives the edges from the
  schemas' `crossRefs`; `CrossRefMeta` gained `relation` (without one, a cross-reference documents
  the model but is not indexed — arc42's `quality-goal.scenario`) and `direction: "reverse"`
  (arc42's `interface.provider` → `provides`). Both resolvers' if-chains are gone; arc42 adds its
  derived interface edges. The metadata order is the edge order, so arc42's deployment node lists
  `parent` before `hosts` (only visible in `arc42 explain deployment-node`). `explain` keeps
  showing field, target kind and cardinality only. Verified: build, check, unit tests, Playwright,
  byte-identical CLI output and identical edge lists on docs and examples.
- [x] Phase 2: `@cli42/lib/schema` (re-exported `z`, list schemas, `CrossRefMeta`, `deriveFields`,
  `shapeOf`, `metaOf`, `chaptersOf`) and `@cli42/lib/model` (`buildWorkspace` with the schema map, a
  diagram hook, `proseConsumedBy`, `keepEmpty`, a message mapper; `parseAttributes`; `BuildIssue` with
  directive default messages; `ElementOf<S>`). Both cores derive `Element` and the per-kind types
  from their schemas and dropped their `zod` dependency. Messages now read "problem — what to do",
  e.g. `Invalid priority 'urgent' on quality-goal — use one of: high, medium, low`; unknown
  attributes suggest the closest known one. biz42 keeps its prose handling (diagrams and bare fences
  end the prose of the next block) via `proseConsumedBy`; arc42 keeps empty `path` via `keepEmpty`.
  Verified: build, check, unit tests, Playwright, byte-identical CLI output on docs and examples.
- [x] Phase 1: `@cli42/lib/validator` (`createValidator`, `applyIgnoreDirectives`, generic `Rule`,
  `SyntaxCheck`) and `@cli42/lib/mermaid` (`createMermaidParser` with a notation → grammar map,
  `mermaidSyntaxCheck` with per-diagram targets and suppression). arc42 keeps `@arc42/mermaid` as a
  thin wrapper (its tests import it); biz42's `@biz42/mermaid` package is gone, `core/src/mermaid.ts`
  maps its notations. biz42's Mermaid check now has arc42's Node fallbacks (unquoted edge labels;
  SIPOC/turtle/strategy maps checked as flowcharts). Verified: build, check, unit tests, Playwright,
  and byte-identical CLI output (validate/get/diff/rules/explain on docs and examples) against the
  pre-phase build.
- [x] Phase 0 verified on a clean install with frozen lockfile in both consumers: build, check,
  unit tests (arc42 496, biz42 88 root + 62 core + 17 workspace-fs) and Playwright (arc42 72,
  biz42 62) green; no test file changed; arc42 −1,401/+122 lines, biz42 −1,362/+120 lines.

## Commit
### Tasks
- [ ] Per phase: one commit in cli42 and one refactoring commit per consumer (Conventional Commits,
  body with Intent / Key decisions / Side effects).
- [ ] Phase 6 commits in biz42 marked as adopting the arc42 way.
- [ ] Publish `@cli42/lib` to npm and switch the consumers' catalog entry (user's decision).
- [ ] Pull requests only when asked; merge cli42 first, because the consumers pin one of its commits.

### Completed
- [x] Phase 0 committed and pushed: cli42 `185a24c`, arc42-language and biz42 on
  `claude/extract-shared-code-cli42-acarwb`.
