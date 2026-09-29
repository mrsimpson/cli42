import type { z } from "zod";
import { shapeOf } from "../schema/introspection.ts";
import type { BlockSchema } from "../schema/introspection.ts";
import type { IgnoreDirective } from "../validator/index.ts";
import { parseAttributes } from "./attributes.ts";
import { defaultMessage } from "./messages.ts";
import type { BuildIssue, MessageMapper } from "./messages.ts";
import type {
  BuiltWorkspace,
  ElementOf,
  ParseError,
  ParseWarning,
  SourceLocation,
} from "./types.ts";

/** The AST shape the builder reads; each language's AST is structurally compatible. */
export type BuildNode =
  | { kind: "heading"; text: string }
  | { kind: "prose"; text: string }
  | { kind: "block"; blockType: string; attributes: Record<string, string>; startLine: number }
  | { kind: "ignore"; ruleCode: string; reason?: string; startLine: number }
  | { kind: "diagram"; startLine: number }
  | { kind: "bare-mermaid"; startLine: number };

export interface BuildDocument {
  filePath: string;
  nodes: readonly BuildNode[];
}

/** Where a diagram block sits: its location with the heading and prose before it. */
export type DiagramContext = SourceLocation;

export type DiagramResult<D> = { diagram: D } | { issue: BuildIssue };

export interface BuildOptions<S extends Readonly<Record<string, z.ZodType>>, N, D> {
  /** The schema of each block type. */
  elements: S;
  /** Build a diagram from its `:::diagram` node; undefined skips it. */
  diagram?: (node: N, context: DiagramContext) => DiagramResult<D> | undefined;
  /** Attributes whose empty value is kept (and validated) rather than treated as absent. */
  keepEmpty?: readonly string[];
  /** Reword the default messages. */
  messages?: MessageMapper;
}

/** Sentinel block type the parser emits for a block it could not close. */
const PARSE_ERROR_BLOCK = "__parse_error__";

/**
 * Build the workspace model from parsed documents: validate every block
 * against its schema into a typed element, collect diagrams and ignore
 * directives, and record what could not be built as parse errors (or, for
 * unknown attributes, warnings) with directive messages.
 */
export function buildWorkspace<
  S extends Readonly<Record<string, z.ZodType>>,
  Doc extends { filePath: string; nodes: readonly unknown[] },
  D = never,
>(
  documents: Doc[],
  options: BuildOptions<S, Extract<Doc["nodes"][number], { kind: "diagram" }>, D>,
): BuiltWorkspace<ElementOf<S>, D, Doc> {
  const elements: ElementOf<S>[] = [];
  const parseErrors: ParseError[] = [];
  const parseWarnings: ParseWarning[] = [];
  const diagrams: D[] = [];
  const ignoreDirectives: IgnoreDirective[] = [];
  const message = (issue: BuildIssue) =>
    options.messages ? options.messages(issue, defaultMessage(issue)) : defaultMessage(issue);
  const keepEmpty = new Set(options.keepEmpty ?? []);
  const blockTypes = Object.keys(options.elements);

  for (const doc of documents) {
    let currentHeading: string | undefined = undefined;
    let pendingProse: string[] = [];
    const locAt = (line: number): SourceLocation => ({
      file: doc.filePath,
      line,
      heading: currentHeading,
      prose: pendingProse.length > 0 ? pendingProse.join("\n") : undefined,
    });

    for (const node of doc.nodes as readonly BuildNode[]) {
      if (node.kind === "ignore") {
        if (node.ruleCode.trim() !== "") {
          ignoreDirectives.push({
            ruleCode: node.ruleCode,
            reason: node.reason,
            file: doc.filePath,
            line: node.startLine,
            used: false,
          });
        }
        continue;
      }
      if (node.kind === "heading") {
        currentHeading = node.text;
        pendingProse = [];
        continue;
      }
      if (node.kind === "prose") {
        pendingProse.push(node.text);
        continue;
      }
      if (node.kind === "diagram") {
        const result = options.diagram?.(
          node as unknown as Extract<Doc["nodes"][number], { kind: "diagram" }>,
          locAt(node.startLine),
        );
        if (result && "issue" in result) {
          parseErrors.push({
            message: message(result.issue),
            file: doc.filePath,
            line: node.startLine,
          });
        } else if (result) {
          diagrams.push(result.diagram);
        }
        continue;
      }
      if (node.kind !== "block") continue;

      const { blockType, attributes, startLine } = node;
      const file = doc.filePath;
      const loc = locAt(startLine);
      // Prose consumed by this block — reset for next block in same section
      pendingProse = [];

      if (!Object.hasOwn(options.elements, blockType)) {
        if (blockType === PARSE_ERROR_BLOCK) {
          parseErrors.push({
            message: attributes["message"] ?? `Unclosed block at line ${startLine}`,
            file,
            line: Number(attributes["startLine"] ?? startLine),
          });
        } else {
          parseErrors.push({
            message: message({ kind: "unknown-block", blockType, known: blockTypes }),
            file,
            line: startLine,
          });
        }
        continue;
      }

      const schema = options.elements[blockType]!;
      // Normalise empty strings to undefined so Zod's optional() treats them
      // as absent (the DSL parser emits "" for `key:` with no value).
      const normalised: Record<string, string | undefined> = {};
      for (const [key, value] of Object.entries(attributes)) {
        normalised[key] = keepEmpty.has(key) || value.trim() !== "" ? value : undefined;
      }

      const result = parseAttributes(schema, normalised, blockType);
      if (!result.ok) {
        parseErrors.push({ message: message(result.issue), file, line: startLine });
        continue;
      }

      // Warn about unknown attributes (keys not in the schema shape).
      // The block is still accepted; only a warning is emitted so the author
      // can spot typos like `sevrity` without losing the element entirely.
      const known = Object.keys(shapeOf(schema as BlockSchema));
      for (const attribute of Object.keys(attributes)) {
        if (!known.includes(attribute)) {
          parseWarnings.push({
            message: message({ kind: "unknown-attribute", subject: blockType, attribute, known }),
            file,
            line: startLine,
          });
        }
      }

      elements.push({ ...(result.data as object), kind: blockType, loc } as ElementOf<S>);
    }
  }

  return { elements, parseErrors, parseWarnings, documents, diagrams, ignoreDirectives };
}
