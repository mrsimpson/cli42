// The public surface arc42-language and biz42 import, per subpath. Removing or
// renaming any of these breaks a consumer; the type-level counterpart is
// consumer-types.ts, checked by `vp check`. Keep both in sync with
// `grep -rho 'from "@cli42/lib/[a-z-]*"'` over both repositories.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vite-plus/test";

const MODULES = {
  asciidoc: () => import("@cli42/lib/asciidoc"),
  cli: () => import("@cli42/lib/cli"),
  diff: () => import("@cli42/lib/diff"),
  explain: () => import("@cli42/lib/explain"),
  git: () => import("@cli42/lib/git"),
  markdown: () => import("@cli42/lib/markdown"),
  mermaid: () => import("@cli42/lib/mermaid"),
  model: () => import("@cli42/lib/model"),
  notation: () => import("@cli42/lib/notation"),
  parser: () => import("@cli42/lib/parser"),
  rules: () => import("@cli42/lib/rules"),
  schema: () => import("@cli42/lib/schema"),
  "text-diff": () => import("@cli42/lib/text-diff"),
  validator: () => import("@cli42/lib/validator"),
  vite: () => import("@cli42/lib/vite"),
  web: () => import("@cli42/lib/web"),
} as const;

/** Runtime values the consumers import from each subpath. */
const CONSUMED: Record<keyof typeof MODULES, string[]> = {
  asciidoc: ["AsciidocProseRenderer"],
  cli: ["USAGE_ERROR", "formatError"],
  diff: [
    "buildDiffView",
    "changeCounts",
    "consistencyFindings",
    "diffWorkspaces",
    "isSemanticChange",
  ],
  explain: [
    "blockGuidance",
    "formatBlockGuidance",
    "formatBlockList",
    "formatIgnoreGuidance",
    "ignoreGuidance",
  ],
  git: [
    "EMPTY_TREE",
    "changedFiles",
    "commitDiffSpec",
    "errorMessage",
    "gitLsFiles",
    "listDocumentHistory",
    "readCommitFiles",
    "readDocumentBlob",
    "resolveComparison",
    "untrackedDocuments",
    "workspaceLocation",
  ],
  markdown: ["MarkdownProseRenderer", "renderMarkdown"],
  mermaid: [
    "createMermaidParser",
    "mermaidSyntaxCheck",
    "mermaidSyntaxParser",
    "parseMermaid",
    "warmMermaid",
  ],
  model: ["buildIndex", "buildWorkspace", "parseAttributes", "relationsOf"],
  notation: ["detectNotation", "parseDocumentAsync", "renderProseNodes"],
  parser: ["parseAsciidoc", "parseMarkdown"],
  rules: ["genericRules"],
  schema: [
    "chaptersOf",
    "deriveFields",
    "metaOf",
    "splitListRequiredSchema",
    "splitListSchema",
    "z",
  ],
  // text-diff is re-exported wholesale by both web apps (`export *`).
  "text-diff": ["diffTokens", "markHtmlChanges", "wordTokens"],
  validator: ["createValidator"],
  vite: ["asciidoctorBrowserPaths"],
  web: [
    "DocumentRoutes",
    "groupNodes",
    "linkIds",
    "loadSnapshot",
    "parseRoute",
    "readHistoryFile",
    "slug",
    "toHistoryPearls",
  ],
};

describe("public surface", () => {
  test("package.json exports exactly the tested subpaths", () => {
    const { exports } = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as {
      exports: Record<string, unknown>;
    };
    expect(
      Object.keys(exports)
        .filter((path) => path !== "./package.json")
        .map((path) => path.slice(2))
        .sort(),
    ).toEqual(Object.keys(MODULES).sort());
  });

  test.each(Object.keys(MODULES) as Array<keyof typeof MODULES>)(
    "@cli42/lib/%s exports what arc42 and biz42 import",
    async (subpath) => {
      const module = (await MODULES[subpath]()) as Record<string, unknown>;
      for (const name of CONSUMED[subpath]) {
        expect(module[name], `${name} from @cli42/lib/${subpath}`).toBeDefined();
      }
    },
  );
});
