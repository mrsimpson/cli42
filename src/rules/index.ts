// Rules every *42 language has: structural rules on the documents and the
// model, independent of the domain. The lib owns their codes (see
// GENERIC_CODES) and metadata; a language adds its own docs fields (e.g. the
// chapter a rule belongs to). Messages read "problem — what to do".
import { idSchemeOf } from "../schema/ids.ts";
import { GENERIC_CODES } from "../validator/codes.ts";
import type { Diagnostic, Rule, RuleMeta } from "../validator/index.ts";
import type { z } from "zod";

interface Located {
  loc: { file: string; line: number };
}

type DocumentNode =
  | { kind: "heading"; text: string }
  | { kind: "prose"; text: string }
  | { kind: "block"; blockType: string; attributes: Record<string, string>; startLine: number }
  | { kind: string; startLine?: number };

interface Documents {
  documents: ReadonlyArray<{ filePath: string; nodes: readonly unknown[] }>;
}

/** The workspace shape the generic rules read. */
export interface GenericRuleWorkspace extends Documents {
  elements: ReadonlyArray<{ id: string; kind: string } & Located>;
  parseErrors: ReadonlyArray<{ message: string; file: string; line: number }>;
  parseWarnings?: ReadonlyArray<{ message: string; file: string; line: number }>;
}

function finding(meta: RuleMeta, message: string, file: string, line: number): Diagnostic {
  return { code: meta.code, severity: meta.severity, message, file, line };
}

function nodesOf(document: { nodes: readonly unknown[] }): readonly DocumentNode[] {
  return document.nodes as readonly DocumentNode[];
}

const META = {
  duplicateId: {
    code: GENERIC_CODES.duplicateId,
    severity: "error",
    type: "problem",
    docs: {
      description: "Duplicate element id — each id must be unique across the workspace",
      rationale:
        "All cross-references are resolved by id. A duplicate id makes references ambiguous — the validator cannot determine which element was intended, and any tooling that indexes by id will produce unpredictable results.",
      recommended: true,
    },
  },
  parseError: {
    code: GENERIC_CODES.parseError,
    severity: "error",
    type: "problem",
    docs: {
      description:
        "Block cannot be built — unknown block type, missing or invalid attribute, or unclosed block",
      rationale:
        "Required attributes are the minimum structural contract of each block type. A block that cannot be built is excluded from the model entirely — there is nothing to index, reference, or validate — so the author's intent is lost until the error is fixed.",
      recommended: true,
    },
  },
  wrongChapter: {
    code: GENERIC_CODES.wrongChapter,
    severity: "error",
    type: "problem",
    docs: {
      description: "Element is documented in a chapter different from its canonical chapter",
      rationale:
        "Each element kind has a canonical chapter. Enforcing that assignment keeps the model consistent with the chapter structure and prevents definitions from being separated from their intended view.",
      recommended: true,
    },
  },
  outsideSection: {
    code: GENERIC_CODES.outsideSection,
    severity: "error",
    type: "problem",
    docs: {
      description: "Block is not placed under any heading — move it into a section below a heading",
      rationale:
        "A block is the structured summary of the section it lives in. Without a preceding heading the block has no section: its narrative context is undefined, and tooling that relates prose to blocks (e.g. the semantic diff) cannot decide which prose belongs to it.",
      recommended: true,
    },
  },
  unknownAttribute: {
    code: GENERIC_CODES.unknownAttribute,
    severity: "warning",
    type: "problem",
    docs: {
      description: "Unknown attribute on a block — likely a typo",
      rationale:
        "An attribute that is not part of the block's schema is silently ignored during parsing. This most commonly indicates a typo (e.g. 'sevrity' instead of 'severity'). The warning lets authors catch these mistakes before the field is silently dropped.",
      recommended: true,
    },
  },
  withoutProse: {
    code: GENERIC_CODES.withoutProse,
    severity: "warning",
    type: "suggestion",
    docs: {
      description:
        "Block has no prose introduction — every block should be preceded by narrative text within its section",
      rationale:
        "The DSL is human-readable first. A block without prose is machine-readable only — it records structured metadata but shares no understanding of why the element exists, what it does, or what tradeoffs were made. The convention is: write the explanation first, then the block as its machine-readable summary. This keeps the document useful to human readers and reviewers, not just tooling.",
      recommended: true,
    },
  },
  multipleBlocks: {
    code: GENERIC_CODES.multipleBlocks,
    severity: "warning",
    type: "suggestion",
    docs: {
      description:
        "Heading section contains more than one block — split into separate sub-sections (one block per heading)",
      rationale:
        "One block per heading section is the structural convention: each element gets its own sub-chapter with a heading, prose, and a block as its structured summary. Packing multiple blocks under one heading loses the per-element narrative context — readers cannot tell which prose describes which element. It also makes the document harder to navigate and reference by section.",
      recommended: true,
    },
  },
  bareMermaid: {
    code: GENERIC_CODES.bareMermaid,
    severity: "warning",
    type: "suggestion",
    docs: {
      description:
        "Mermaid fenced block has no :::diagram metadata block — add :::diagram with id and notation inside the language fence",
      rationale:
        "A :::diagram block before the ```mermaid fence gives the diagram an id and a notation. Without it the diagram is anonymous: it renders visually but cannot be queried, validated against the model by notation-specific rules, or cross-referenced from other elements.",
      recommended: true,
    },
  },
  outsideFence: {
    code: GENERIC_CODES.outsideFence,
    severity: "warning",
    type: "suggestion",
    docs: {
      description:
        "Block is not wrapped in the language fence — wrap :::blocks with the notation-appropriate fence for proper rendering",
      rationale:
        "Standard Markdown renderers do not understand the :::type syntax and render the delimiter lines as raw text. Wrapping a :::block in the language fence causes renderers to display it as a styled, bordered code block, making the document readable in GitHub, VS Code, and AI tools without changing the DSL or the parser output. Diagram metadata must also be inside the fence so the parser can distinguish it from prose.",
      recommended: true,
    },
  },
  staleIgnore: {
    code: GENERIC_CODES.staleIgnore,
    severity: "warning",
    type: "problem",
    docs: {
      description:
        "Ignore directive did not suppress any diagnostic — remove it when the underlying issue is resolved",
      rationale:
        "An ignore directive documents a deliberate exception. When the finding it suppressed is gone, the directive only misleads readers into believing an exception still exists.",
      recommended: true,
    },
  },
  rejectedIgnore: {
    code: GENERIC_CODES.rejectedIgnore,
    severity: "warning",
    type: "problem",
    docs: {
      description: "Ignore directive targets an error — errors must be fixed, not ignored",
      rationale:
        "Errors are structural: the affected block is excluded from the model or the model is inconsistent. Only warnings and hints describe judgment calls an author can accept deliberately.",
      recommended: true,
    },
  },
  idScheme: {
    code: GENERIC_CODES.idScheme,
    severity: "warning",
    type: "suggestion",
    docs: {
      description:
        "Element id does not follow its kind's id scheme — start it with the kind's prefix (e.g. 'risk-')",
      rationale:
        "An id that carries its kind's prefix says what it refers to wherever it appears: in references, in diagrams and in prose. Tools rely on the same scheme to recognise ids in text — diagram rules check them, and the web view links them.",
      recommended: true,
    },
  },
} as const satisfies Record<string, RuleMeta>;

/** Each element id must be unique across the workspace. */
export const duplicateIdRule: Rule<GenericRuleWorkspace, unknown, unknown> = {
  meta: META.duplicateId,
  check(workspace) {
    const diagnostics: Diagnostic[] = [];
    const seen = new Map<string, { file: string; line: number }>();
    for (const element of workspace.elements) {
      const previous = seen.get(element.id);
      if (previous) {
        diagnostics.push(
          finding(
            META.duplicateId,
            `Duplicate id '${element.id}' (first defined at ${previous.file}:${previous.line}) — give each element its own id`,
            element.loc.file,
            element.loc.line,
          ),
        );
      } else {
        seen.set(element.id, { file: element.loc.file, line: element.loc.line });
      }
    }
    return diagnostics;
  },
};

/** Every block the model builder could not build is reported with its message. */
export const parseErrorRule: Rule<GenericRuleWorkspace, unknown, unknown> = {
  meta: META.parseError,
  check: (workspace) =>
    workspace.parseErrors.map((error) =>
      finding(META.parseError, error.message, error.file, error.line),
    ),
};

/** Attributes a block's schema does not know are reported (likely typos). */
export const unknownAttributeRule: Rule<GenericRuleWorkspace, unknown, unknown> = {
  meta: META.unknownAttribute,
  check: (workspace) =>
    (workspace.parseWarnings ?? []).map((warning) =>
      finding(META.unknownAttribute, warning.message, warning.file, warning.line),
    ),
};

/** Every block is introduced by prose within its section. */
export const blockWithoutProseRule: Rule<GenericRuleWorkspace, unknown, unknown> = {
  meta: META.withoutProse,
  check(workspace) {
    const diagnostics: Diagnostic[] = [];
    for (const document of workspace.documents) {
      let hasProseAfterLastHeading = false;
      for (const node of nodesOf(document)) {
        if (node.kind === "heading") {
          // Reset prose tracking when entering a new section
          hasProseAfterLastHeading = false;
        } else if (node.kind === "prose" && "text" in node && node.text.trim().length > 0) {
          // Only non-blank prose counts as an introduction. Blank-line prose
          // nodes are emitted by the parser to preserve Markdown paragraph
          // boundaries and must not count as introductions.
          hasProseAfterLastHeading = true;
        } else if (node.kind === "block" && "attributes" in node) {
          // Skip error sentinel blocks emitted by the parser for unclosed blocks
          if (node.blockType === "__parse_error__") continue;
          if (!hasProseAfterLastHeading) {
            diagnostics.push(
              finding(
                META.withoutProse,
                `Block '${node.attributes["id"] ?? node.blockType}' has no prose introduction in its section — describe it in prose before the block`,
                document.filePath,
                node.startLine,
              ),
            );
          }
          // After a block, prose tracking resets for the next block in the same section
          hasProseAfterLastHeading = false;
        }
      }
    }
    return diagnostics;
  },
};

/** One block per heading section. */
export const multipleBlocksUnderHeadingRule: Rule<GenericRuleWorkspace, unknown, unknown> = {
  meta: META.multipleBlocks,
  check(workspace) {
    const diagnostics: Diagnostic[] = [];
    for (const document of workspace.documents) {
      let currentHeadingText = "(start of file)";
      let blockCountInSection = 0;
      let firstBlockLine = 0;

      const flushSection = () => {
        if (blockCountInSection > 1) {
          diagnostics.push(
            finding(
              META.multipleBlocks,
              `Section '${currentHeadingText}' contains ${blockCountInSection} blocks — each block should have its own sub-section heading`,
              document.filePath,
              firstBlockLine,
            ),
          );
        }
      };

      for (const node of nodesOf(document)) {
        if (node.kind === "heading" && "text" in node) {
          flushSection();
          currentHeadingText = node.text;
          blockCountInSection = 0;
          firstBlockLine = 0;
        } else if (node.kind === "block") {
          blockCountInSection++;
          if (blockCountInSection === 1) firstBlockLine = node.startLine ?? 0;
        }
      }
      // Flush the last section
      flushSection();
    }
    return diagnostics;
  },
};

/** A Mermaid fence is introduced by a `:::diagram` metadata block. */
export const bareMermaidRule: Rule<GenericRuleWorkspace, unknown, unknown> = {
  meta: META.bareMermaid,
  check(workspace) {
    const diagnostics: Diagnostic[] = [];
    for (const document of workspace.documents) {
      for (const node of nodesOf(document)) {
        if (node.kind !== "bare-mermaid") continue;
        diagnostics.push(
          finding(
            META.bareMermaid,
            "Mermaid diagram has no :::diagram metadata block — add :::diagram with id and notation before the ```mermaid fence",
            document.filePath,
            node.startLine ?? 0,
          ),
        );
      }
    }
    return diagnostics;
  },
};

/** Every block is placed under a heading, in a section. */
export const blockOutsideSectionRule: Rule<GenericRuleWorkspace, unknown, unknown> = {
  meta: META.outsideSection,
  check(workspace) {
    const diagnostics: Diagnostic[] = [];
    for (const document of workspace.documents) {
      for (const node of nodesOf(document)) {
        if (node.kind === "heading") break;
        if (node.kind !== "block" || !("attributes" in node)) continue;
        const label = node.attributes["id"] ?? node.blockType;
        diagnostics.push(
          finding(
            META.outsideSection,
            `Block '${label}' is not placed under any heading — add a heading above it`,
            document.filePath,
            node.startLine,
          ),
        );
      }
    }
    return diagnostics;
  },
};

/** Each element kind is documented in its canonical chapter. */
export function elementWrongChapterRule(options: {
  /** The chapter each element kind belongs to. */
  chapters: Readonly<Record<string, number>>;
  /** The chapter a document file is, or null when its name does not say. */
  chapterOfFile: (path: string) => number | null;
}): Rule<GenericRuleWorkspace, unknown, unknown> {
  return {
    meta: META.wrongChapter,
    check(workspace) {
      const diagnostics: Diagnostic[] = [];
      for (const element of workspace.elements) {
        const actual = options.chapterOfFile(element.loc.file);
        if (actual === null) continue;
        const expected = options.chapters[element.kind];
        if (actual === expected) continue;
        diagnostics.push(
          finding(
            META.wrongChapter,
            `${element.kind} '${element.id}' belongs in chapter ${expected}, but is documented in chapter ${actual} — move it to chapter ${expected}`,
            element.loc.file,
            element.loc.line,
          ),
        );
      }
      return diagnostics;
    },
  };
}

/** Every block is wrapped in the language fence, so Markdown renderers display it. */
export function blockNotInFenceRule<C>(options: {
  /** Name of the block node's flag telling whether it sat inside the fence. */
  fenceFlag: string;
  /** How the fence is called in the message, e.g. "```arc42 fence". */
  fenceDescription: (context?: C) => string;
}): Rule<GenericRuleWorkspace, unknown, C> {
  return {
    meta: META.outsideFence,
    check(workspace, _index, context) {
      const fenceDescription = options.fenceDescription(context);
      const diagnostics: Diagnostic[] = [];
      for (const document of workspace.documents) {
        for (const node of nodesOf(document)) {
          if (node.kind !== "block" || !("attributes" in node)) continue;
          if (node.blockType === "__parse_error__") continue; // error sentinel — not a real block
          if ((node as unknown as Record<string, unknown>)[options.fenceFlag]) continue;
          diagnostics.push(
            finding(
              META.outsideFence,
              `Block '${node.attributes["id"] ?? node.blockType}' is not wrapped in a ${fenceDescription} — wrap it for proper rendering`,
              document.filePath,
              node.startLine,
            ),
          );
        }
      }
      return diagnostics;
    },
  };
}

/**
 * Documents the findings of ignore directives (WG06, WG07). The validation
 * engine reports them while applying the directives; the rules themselves
 * find nothing.
 */
export const staleIgnoreRule: Rule<GenericRuleWorkspace, unknown, unknown> = {
  meta: META.staleIgnore,
  check: () => [],
};

export const rejectedIgnoreRule: Rule<GenericRuleWorkspace, unknown, unknown> = {
  meta: META.rejectedIgnore,
  check: () => [],
};

/** Each element id follows the id scheme its kind declares (`idPrefixes` in the schema's meta). */
export function idSchemeRule(
  schemas: Readonly<Record<string, z.ZodType>>,
): Rule<GenericRuleWorkspace, unknown, unknown> {
  const scheme = idSchemeOf(schemas);
  const quoted = (prefixes: readonly string[]) => prefixes.map((prefix) => `'${prefix}-'`);
  return {
    meta: META.idScheme,
    check(workspace) {
      const diagnostics: Diagnostic[] = [];
      for (const element of workspace.elements) {
        if (scheme.follows(element.kind, element.id)) continue;
        const [canonical, ...others] = quoted(scheme.prefixes.get(element.kind) ?? []);
        const alternatives = others.length > 0 ? ` (or ${others.join(", ")})` : "";
        diagnostics.push(
          finding(
            META.idScheme,
            `${element.kind} id '${element.id}' does not follow its id scheme — start it with ${canonical}${alternatives}`,
            element.loc.file,
            element.loc.line,
          ),
        );
      }
      return diagnostics;
    },
  };
}

export interface GenericRuleOptions<C> {
  /** The chapter each element kind belongs to (EG03). */
  chapters: Readonly<Record<string, number>>;
  /** The chapter a document file is, or null when its name does not say (EG03). */
  chapterOfFile: (path: string) => number | null;
  /** Name of the block node's flag telling whether it sat inside the fence (WG05). */
  fenceFlag: string;
  /** How the fence is called in messages, e.g. "```arc42 fence" (WG05). */
  fenceDescription: (context?: C) => string;
  /**
   * The language's element schemas (WG08). A language that passes them gets
   * the id scheme check for every kind that declares `idPrefixes`.
   */
  schemas?: Readonly<Record<string, z.ZodType>>;
}

/** All generic rules, in code order. A language adds its own docs fields to their metadata. */
export function genericRules<C>(
  options: GenericRuleOptions<C>,
): Array<Rule<GenericRuleWorkspace, unknown, C>> {
  return [
    duplicateIdRule,
    parseErrorRule,
    elementWrongChapterRule(options),
    blockOutsideSectionRule,
    unknownAttributeRule,
    blockWithoutProseRule,
    multipleBlocksUnderHeadingRule,
    bareMermaidRule,
    blockNotInFenceRule<C>(options),
    staleIgnoreRule,
    rejectedIgnoreRule,
    ...(options.schemas ? [idSchemeRule(options.schemas)] : []),
  ];
}

export { GENERIC_CODES };
