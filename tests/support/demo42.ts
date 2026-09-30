// demo42 — a minimal *42 language, wired to @cli42/lib the way arc42 and
// biz42 are (see their packages/core): a dialect, parsers for Markdown and
// AsciiDoc, notation adapters, schemas with guidance metadata, the model
// builder and reference index, the generic rules plus a language rule, and
// the validator with Mermaid's syntax check. Every import goes through the
// published subpaths, so the tests exercise what npm consumers get.
import { MarkdownProseRenderer } from "@cli42/lib/markdown";
import { buildIndex, buildWorkspace } from "@cli42/lib/model";
import type { DiagramResult, ElementOf, SourceLocation } from "@cli42/lib/model";
import { createMermaidParser, mermaidSyntaxCheck } from "@cli42/lib/mermaid";
import type { MermaidGrammar } from "@cli42/lib/mermaid";
import { detectNotation, parseDocumentAsync } from "@cli42/lib/notation";
import type { NotationAdapter, ProseRenderer } from "@cli42/lib/notation";
import { parseAsciidoc, parseMarkdown } from "@cli42/lib/parser";
import type {
  BareMermaidNode,
  DiagramMetadata,
  DslDialect,
  HeadingNode,
  IgnoreNode,
  MarkdownBlockNode,
  ProseNode,
} from "@cli42/lib/parser";
import { genericRules } from "@cli42/lib/rules";
import { chaptersOf, splitListSchema, z } from "@cli42/lib/schema";
import type { CrossRefMeta } from "@cli42/lib/schema";
import { createValidator } from "@cli42/lib/validator";
import type { Diagnostic, IgnoreDirective, Rule, RuleDocs } from "@cli42/lib/validator";

// ---------------------------------------------------------------------------
// AST and dialect
// ---------------------------------------------------------------------------

export interface DiagramNode {
  kind: "diagram";
  id: string;
  title?: string;
  notation: string;
  source: string;
  startLine: number;
  endLine: number;
}

export type BlockNode = MarkdownBlockNode & { inDemoFence: boolean };
export type AstNode =
  | HeadingNode
  | ProseNode
  | BlockNode
  | DiagramNode
  | BareMermaidNode
  | IgnoreNode;

export interface DocumentAst {
  filePath: string;
  nodes: AstNode[];
}

export const DEMO_DIALECT: DslDialect<DiagramNode, "inDemoFence"> = {
  fences: ["demo42"],
  fenceFlag: "inDemoFence",
  createDiagram: ({ attributes, startLine }: DiagramMetadata, source, endLine) => ({
    kind: "diagram",
    id: attributes["id"] ?? "",
    title: attributes["title"],
    notation: attributes["notation"] ?? "auto",
    source,
    startLine,
    endLine,
  }),
};

// ---------------------------------------------------------------------------
// Schemas — all guidance lives in .meta(), as in arc42 and biz42
// ---------------------------------------------------------------------------

export const SystemSchema = z
  .object({
    id: z.string().min(1).meta({ description: "Unique identifier" }),
    title: z.string().min(1).meta({ description: "Name of the system" }),
  })
  .meta({
    description: "The system the documentation describes.",
    demoChapter: 1,
    crossRefs: [] satisfies CrossRefMeta[],
    authoringTips: ["Document exactly one system."],
  });

export const ServiceSchema = z
  .object({
    id: z.string().min(1).meta({ description: "Unique identifier" }),
    title: z.string().min(1).meta({ description: "Name of the service" }),
    status: z.enum(["planned", "live"]).meta({ description: "Lifecycle status" }),
    uses: splitListSchema.meta({ description: "Comma-separated service ids this one calls" }),
    part: z.string().optional().meta({ description: "System this service belongs to" }),
  })
  .meta({
    description: "A deployable service.",
    demoChapter: 2,
    crossRefs: [
      { field: "uses", targetKind: "service", cardinality: "many", relation: "uses" },
      { field: "part", targetKind: "system", cardinality: "one", relation: "part-of" },
    ] satisfies CrossRefMeta[],
    authoringTips: ["Name services after what they do."],
  });

export const TeamSchema = z
  .object({
    id: z.string().min(1).meta({ description: "Unique identifier" }),
    title: z.string().min(1).meta({ description: "Name of the team" }),
    owns: splitListSchema.meta({ description: "Comma-separated ids of the services it owns" }),
  })
  .meta({
    description: "A team that owns services.",
    demoChapter: 3,
    crossRefs: [
      {
        field: "owns",
        targetKind: "service or system",
        cardinality: "many",
        relation: "owned-by",
        direction: "reverse",
      },
    ] satisfies CrossRefMeta[],
    authoringTips: [],
  });

export const ELEMENT_SCHEMAS = {
  system: SystemSchema,
  service: ServiceSchema,
  team: TeamSchema,
} as const;

export type BlockType = keyof typeof ELEMENT_SCHEMAS;
export type Element = ElementOf<typeof ELEMENT_SCHEMAS>;

export const ELEMENT_CHAPTER = chaptersOf(ELEMENT_SCHEMAS, "demoChapter");

// ---------------------------------------------------------------------------
// Notations
// ---------------------------------------------------------------------------

class MarkdownParser {
  parse(filePath: string, content: string): DocumentAst {
    return parseMarkdown(filePath, content, DEMO_DIALECT) as DocumentAst;
  }
}

class AsciidocParser {
  parse(filePath: string, content: string): DocumentAst {
    return parseAsciidoc(filePath, content, DEMO_DIALECT) as DocumentAst;
  }
}

/** Loads Asciidoctor on first use, as biz42 does. */
class LazyAsciidocProseRenderer implements ProseRenderer {
  private renderer: Promise<ProseRenderer> | undefined;
  async renderProse(text: string): Promise<string> {
    this.renderer ??= import("@cli42/lib/asciidoc").then(
      ({ AsciidocProseRenderer }) => new AsciidocProseRenderer(),
    );
    return (await this.renderer).renderProse(text);
  }
}

type Notation = "markdown" | "asciidoc";

function adapter(
  notation: Notation,
  fileExtension: string,
  fenceDescription: string,
  createParser: () => MarkdownParser | AsciidocParser,
  createProseRenderer: () => ProseRenderer,
): NotationAdapter<Notation, DocumentAst> {
  return {
    notation,
    fileExtension,
    fenceDescription,
    matchesFile: (filename) => filename.endsWith(fileExtension),
    createParser,
    createProseRenderer,
    chapterFilename: (number, slug) => `${String(number).padStart(2, "0")}-${slug}${fileExtension}`,
  };
}

export const NOTATIONS = {
  markdown: adapter(
    "markdown",
    ".demo42.md",
    "```demo42 fence",
    () => new MarkdownParser(),
    () => new MarkdownProseRenderer(),
  ),
  asciidoc: adapter(
    "asciidoc",
    ".demo42.adoc",
    "[source,demo42] / ---- fence",
    () => new AsciidocParser(),
    () => new LazyAsciidocProseRenderer(),
  ),
} as const;

export function isDocument(path: string): boolean {
  return Object.values(NOTATIONS).some((notation) => notation.matchesFile(path));
}

export function notationOfFile(path: string): NotationAdapter<Notation, DocumentAst> {
  return NOTATIONS.asciidoc.matchesFile(path) ? NOTATIONS.asciidoc : NOTATIONS.markdown;
}

export function detectWorkspaceNotation(paths: readonly string[], location: string): Notation {
  return detectNotation<Notation>(
    paths,
    Object.values(NOTATIONS).map(
      (notation) => [notation.notation, notation.fileExtension] as const,
    ),
    location,
  );
}

export function parseDocument(filePath: string, content: string): DocumentAst {
  return notationOfFile(filePath).createParser().parse(filePath, content);
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface Diagram {
  id: string;
  title?: string;
  notation: string;
  source: string;
  loc: SourceLocation;
}

export function buildDemoWorkspace(documents: DocumentAst[]) {
  return buildWorkspace(documents, {
    elements: ELEMENT_SCHEMAS,
    diagram: (node: DiagramNode, loc): DiagramResult<Diagram> =>
      node.id
        ? {
            diagram: {
              id: node.id,
              title: node.title,
              notation: node.notation,
              source: node.source,
              loc,
            },
          }
        : { issue: { kind: "missing-attribute", subject: "diagram", field: "id" } },
  });
}

export type Workspace = ReturnType<typeof buildDemoWorkspace>;

export function buildDemoIndex(workspace: Workspace) {
  return buildIndex<Element, "uses" | "part-of" | "owned-by">(workspace.elements, ELEMENT_SCHEMAS);
}

export type ReferenceIndex = ReturnType<typeof buildDemoIndex>;

/** The payload the diff reads — the same shape as arc42's and biz42's WorkspacePayload. */
export interface WorkspacePayload {
  elements: Element[];
  edges: ReferenceIndex["edges"];
  documents: DocumentAst[];
  diagrams: Diagram[];
  ignoreDirectives: IgnoreDirective[];
}

const proseRenderers = new Map<string, ProseRenderer>();

/** Files in, model out, with rendered prose (loadWorkspaceFromFiles in biz42). */
export async function loadWorkspaceFromFiles(
  files: ReadonlyArray<{ path: string; content: string }>,
): Promise<WorkspacePayload> {
  const documents = await Promise.all(
    files.map((file) => {
      const notation = notationOfFile(file.path);
      let renderer = proseRenderers.get(notation.notation);
      if (!renderer)
        proseRenderers.set(notation.notation, (renderer = notation.createProseRenderer()));
      return parseDocumentAsync(file.path, file.content, notation.createParser(), renderer);
    }),
  );
  const workspace = buildDemoWorkspace(documents);
  const index = buildDemoIndex(workspace);
  return {
    elements: workspace.elements,
    edges: index.edges,
    documents: workspace.documents,
    diagrams: workspace.diagrams,
    ignoreDirectives: workspace.ignoreDirectives,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationContext {
  fenceDescription?: string;
}

interface DemoRuleDocs extends RuleDocs {
  demoChapter: number;
}

type DemoRule = Rule<Workspace, ReferenceIndex, ValidationContext, DemoRuleDocs>;

/** A language rule: a live service without an owning team (hint). */
export const h001ServiceWithoutTeam: DemoRule = {
  meta: {
    code: "H001",
    severity: "hint",
    type: "suggestion",
    docs: {
      description: "Service is not owned by any team",
      rationale: "Every service needs an owner.",
      recommended: true,
      demoChapter: 2,
    },
  },
  check(workspace, index) {
    const diagnostics: Diagnostic[] = [];
    for (const element of workspace.elements) {
      if (element.kind !== "service") continue;
      const owned = index.edges.some(
        (edge) => edge.from === element.id && edge.relation === "owned-by",
      );
      if (!owned) {
        diagnostics.push({
          code: "H001",
          severity: "hint",
          message: `Service '${element.id}' is not owned by any team`,
          file: element.loc.file,
          line: element.loc.line,
        });
      }
    }
    return diagnostics;
  },
};

/** A language error rule (E-prefix), to check that errors cannot be ignored. */
export const e001ServiceUsesItself: DemoRule = {
  meta: {
    code: "E001",
    severity: "error",
    type: "problem",
    docs: {
      description: "Service uses itself",
      rationale: "A self-dependency is a modelling mistake.",
      recommended: true,
      demoChapter: 2,
    },
  },
  check(workspace) {
    return workspace.elements.flatMap((element) =>
      element.kind === "service" && element.uses.includes(element.id)
        ? [
            {
              code: "E001",
              severity: "error" as const,
              message: `Service '${element.id}' uses itself`,
              file: element.loc.file,
              line: element.loc.line,
            },
          ]
        : [],
    );
  },
};

/** Chapter from the file name convention: 02-services.demo42.md → 2. */
export function chapterOfFile(path: string): number | null {
  const match = /^(\d{2})-/.exec(path.split("/").pop() ?? "");
  return match ? Number(match[1]) : null;
}

export const RULES: readonly DemoRule[] = [
  ...genericRules<ValidationContext>({
    chapters: ELEMENT_CHAPTER,
    chapterOfFile,
    fenceFlag: "inDemoFence",
    fenceDescription: (context) => context?.fenceDescription ?? "```demo42 fence",
  }).map((rule) => ({
    ...rule,
    meta: { ...rule.meta, docs: { ...rule.meta.docs, demoChapter: 0 } },
  })),
  e001ServiceUsesItself,
  h001ServiceWithoutTeam,
] as DemoRule[];

const GRAMMARS = {
  flowchart: "flowchart",
  sequence: "sequence",
  auto: "auto",
  "service-map": "flowchart",
} as const satisfies Record<string, MermaidGrammar>;

type MermaidNotation = keyof typeof GRAMMARS;

export const mermaidParser = createMermaidParser<MermaidNotation>(GRAMMARS);

/** Mermaid's syntax check: a syntax error suppresses the diagram rules' findings (E003). */
export const mermaidSyntax = mermaidSyntaxCheck<MermaidNotation, Diagram, Workspace>({
  parser: mermaidParser,
  diagram: (diagram) => ({
    notation: (diagram.notation in GRAMMARS ? diagram.notation : "auto") as MermaidNotation,
    code: diagram.notation === "service-map" ? "E002" : "E010",
    suppresses: (code) => code === "E002" || code === "E010" || code === "E003",
  }),
  bare: (source) => (source.trim() ? { notation: "auto", code: "E010" } : undefined),
});

export const validator = createValidator({ rules: RULES, syntax: mermaidSyntax });

/** Validate documents the way `arc42 validate` / `biz42 validate` do (sync rules only). */
export function validateDocuments(
  documents: DocumentAst[],
  context?: ValidationContext,
): Diagnostic[] {
  const workspace = buildDemoWorkspace(documents);
  return validator.validate(workspace, buildDemoIndex(workspace), context);
}

/** Validate including Mermaid's syntax check. */
export function validateDocumentsAsync(
  documents: DocumentAst[],
  context?: ValidationContext,
): Promise<Diagnostic[]> {
  const workspace = buildDemoWorkspace(documents);
  return validator.validateAsync(workspace, buildDemoIndex(workspace), context);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** A Markdown document body from lines. */
export function md(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

/** A block inside the language fence. */
export function block(type: string, attributes: Record<string, string>): string[] {
  return [
    "```demo42",
    `:::${type}`,
    ...Object.entries(attributes).map(([key, value]) => `${key}: ${value}`),
    ":::",
    "```",
  ];
}
