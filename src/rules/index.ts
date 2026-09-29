// Rules every *42 language has: structural rules on the documents and the
// model, independent of the domain. Each factory takes the language's rule
// metadata (code, severity, type, docs); findings use its code and severity.
// Messages read "problem — what to do".
import type { Diagnostic, Rule, RuleDocs, RuleMeta } from "../validator/index.ts";

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

function finding(
  meta: RuleMeta<RuleDocs>,
  message: string,
  file: string,
  line: number,
): Diagnostic {
  return { code: meta.code, severity: meta.severity, message, file, line };
}

function nodesOf(document: { nodes: readonly unknown[] }): readonly DocumentNode[] {
  return document.nodes as readonly DocumentNode[];
}

/** Each element id must be unique across the workspace. */
export function duplicateIdRule<D extends RuleDocs>(
  meta: RuleMeta<D>,
): Rule<{ elements: ReadonlyArray<{ id: string } & Located> }, unknown, unknown, D> {
  return {
    meta,
    check(workspace) {
      const diagnostics: Diagnostic[] = [];
      const seen = new Map<string, { file: string; line: number }>();
      for (const element of workspace.elements) {
        const previous = seen.get(element.id);
        if (previous) {
          diagnostics.push(
            finding(
              meta,
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
}

/** Every block the model builder could not build is reported with its message. */
export function parseErrorRule<D extends RuleDocs>(
  meta: RuleMeta<D>,
): Rule<
  { parseErrors: ReadonlyArray<{ message: string; file: string; line: number }> },
  unknown,
  unknown,
  D
> {
  return {
    meta,
    check: (workspace) =>
      workspace.parseErrors.map((error) => finding(meta, error.message, error.file, error.line)),
  };
}

/** Attributes a block's schema does not know are reported (likely typos). */
export function unknownAttributeRule<D extends RuleDocs>(
  meta: RuleMeta<D>,
): Rule<
  { parseWarnings?: ReadonlyArray<{ message: string; file: string; line: number }> },
  unknown,
  unknown,
  D
> {
  return {
    meta,
    check: (workspace) =>
      (workspace.parseWarnings ?? []).map((warning) =>
        finding(meta, warning.message, warning.file, warning.line),
      ),
  };
}

/** Every block is introduced by prose within its section. */
export function blockWithoutProseRule<D extends RuleDocs>(
  meta: RuleMeta<D>,
): Rule<Documents, unknown, unknown, D> {
  return {
    meta,
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
                  meta,
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
}

/** One block per heading section. */
export function multipleBlocksUnderHeadingRule<D extends RuleDocs>(
  meta: RuleMeta<D>,
): Rule<Documents, unknown, unknown, D> {
  return {
    meta,
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
                meta,
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
}

/** A Mermaid fence is introduced by a `:::diagram` metadata block. */
export function bareMermaidRule<D extends RuleDocs>(
  meta: RuleMeta<D>,
): Rule<Documents, unknown, unknown, D> {
  return {
    meta,
    check(workspace) {
      const diagnostics: Diagnostic[] = [];
      for (const document of workspace.documents) {
        for (const node of nodesOf(document)) {
          if (node.kind !== "bare-mermaid") continue;
          diagnostics.push(
            finding(
              meta,
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
}

/** Each element kind is documented in its canonical chapter. */
export function elementWrongChapterRule<K extends string, D extends RuleDocs>(
  meta: RuleMeta<D>,
  options: {
    /** The chapter each element kind belongs to. */
    chapters: Readonly<Record<K, number>>;
    /** The chapter a document file is, or null when its name does not say. */
    chapterOfFile: (path: string) => number | null;
  },
): Rule<{ elements: ReadonlyArray<{ id: string; kind: K } & Located> }, unknown, unknown, D> {
  return {
    meta,
    check(workspace) {
      const diagnostics: Diagnostic[] = [];
      for (const element of workspace.elements) {
        const actual = options.chapterOfFile(element.loc.file);
        if (actual === null) continue;
        const expected = options.chapters[element.kind];
        if (actual === expected) continue;
        diagnostics.push(
          finding(
            meta,
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

/** Every block is placed under a heading, in a section. */
export function blockOutsideSectionRule<D extends RuleDocs>(
  meta: RuleMeta<D>,
): Rule<Documents, unknown, unknown, D> {
  return {
    meta,
    check(workspace) {
      const diagnostics: Diagnostic[] = [];
      for (const document of workspace.documents) {
        for (const node of nodesOf(document)) {
          if (node.kind === "heading") break;
          if (node.kind !== "block" || !("attributes" in node)) continue;
          const label = node.attributes["id"] ?? node.blockType;
          diagnostics.push(
            finding(
              meta,
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
}

/** Every block is wrapped in the language fence, so Markdown renderers display it. */
export function blockNotInFenceRule<C, D extends RuleDocs>(
  meta: RuleMeta<D>,
  options: {
    /** Name of the block node's flag telling whether it sat inside the fence. */
    fenceFlag: string;
    /** How the fence is called in the message, e.g. "```arc42 fence". */
    fenceDescription: (context?: C) => string;
  },
): Rule<Documents, unknown, C, D> {
  return {
    meta,
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
              meta,
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
