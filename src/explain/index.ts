// Authoring guidance of a *42 language, derived from its schemas: the fields,
// cross-references and tips of each block type, and the ignore directive.
import type { z } from "zod";
import { deriveFields, metaOf } from "../schema/introspection.ts";
import type { BlockSchema, CrossRefMeta, FieldMeta } from "../schema/introspection.ts";

export type ExplainFieldResult = FieldMeta;

export interface ExplainCrossRefResult {
  field: string;
  targetKind: string;
  cardinality: "one" | "many";
}

/** What a block's schema tells its author. */
export interface BlockGuidance {
  description: string;
  requiredFields: ExplainFieldResult[];
  optionalFields: ExplainFieldResult[];
  crossRefs: ExplainCrossRefResult[];
  authoringTips: string[];
}

interface SchemaMeta {
  description?: string;
  crossRefs?: CrossRefMeta[];
  authoringTips?: string[];
}

/**
 * The guidance of a block type from its schema's `.meta()` (description,
 * cross-references, authoring tips) and its fields (required, enum values).
 */
export function blockGuidance(schema: z.ZodType, name: string): BlockGuidance {
  const meta = (metaOf<SchemaMeta>(schema) ?? {}) as SchemaMeta;
  const fields = deriveFields(schema as BlockSchema);
  return {
    description: meta.description ?? name,
    requiredFields: fields.filter((field) => field.required),
    optionalFields: fields.filter((field) => !field.required),
    crossRefs: (meta.crossRefs ?? []).map(({ field, targetKind, cardinality }) => ({
      field,
      targetKind,
      cardinality,
    })),
    authoringTips: meta.authoringTips ?? [],
  };
}

/** Render guidance as text below its heading line. */
export function formatBlockGuidance(heading: string, guidance: BlockGuidance): string {
  const lines: string[] = [];
  lines.push(heading);
  lines.push("");
  lines.push(`  ${guidance.description}`);

  const fieldLines = (title: string, fields: ExplainFieldResult[]) => {
    if (fields.length === 0) return;
    lines.push("");
    lines.push(`  ${title}:`);
    for (const f of fields) {
      const enumSuffix = f.enumValues ? `  [${f.enumValues.join(" | ")}]` : "";
      lines.push(`    ${f.name.padEnd(14)} ${f.description}${enumSuffix}`);
    }
  };
  fieldLines("Required fields", guidance.requiredFields);
  fieldLines("Optional fields", guidance.optionalFields);

  if (guidance.crossRefs.length > 0) {
    lines.push("");
    lines.push("  Cross-references:");
    for (const c of guidance.crossRefs) {
      const card = c.cardinality === "many" ? "(comma-separated)" : "";
      lines.push(`    ${c.field.padEnd(14)} → ${c.targetKind} ${card}`.trimEnd());
    }
  }

  if (guidance.authoringTips.length > 0) {
    lines.push("");
    lines.push("  Authoring tips:");
    for (const tip of guidance.authoringTips) {
      lines.push(`    - ${tip}`);
    }
  }

  return lines.join("\n");
}

/** One line of the block type list. */
export interface BlockListEntry {
  blockType: string;
  chapter: number;
  description: string;
}

/** Render the list of block types with their chapter and description. */
export function formatBlockList(cli: string, entries: readonly BlockListEntry[]): string {
  const lines: string[] = [];
  lines.push(`Block types (run \`${cli} explain <type>\` for full guidance):`);
  lines.push("");
  for (const entry of entries) {
    lines.push(
      `  ${entry.blockType.padEnd(20)} ch.${String(entry.chapter).padEnd(3)}  ${entry.description}`,
    );
  }
  return lines.join("\n");
}

export interface ExplainIgnoreResult {
  name: string;
  description: string;
  syntax: string[];
  constraints: string[];
  authoringTips: string[];
}

/** What differs between languages in the guidance for `:::ignore`. */
export interface IgnoreGuidanceOptions {
  /** The CLI's name, e.g. "arc42". */
  cli: string;
  /** How a document is called, with its article, e.g. "an arc42 document". */
  document: string;
  /** The info string of the language fence, e.g. "arc42". */
  fence: string;
  /** Code of the finding for a directive that targets an error. */
  rejectedCode: string;
  /** Code of the finding for an unused directive. */
  staleCode: string;
  /** An example directive line, e.g. ":::ignore H001 ...". */
  example: string;
  /** The file that records suppressed hints, e.g. "architecture-evidence.md". */
  evidenceFile: string;
}

/** The guidance for the `:::ignore` directive of a language. */
export function ignoreGuidance(options: IgnoreGuidanceOptions): ExplainIgnoreResult {
  const { cli, document, fence, rejectedCode, staleCode, example, evidenceFile } = options;
  return {
    name: "ignore directive",
    description:
      "The :::ignore directive suppresses a specific warning (W) or hint (H) diagnostic on a " +
      `given line of ${document}. It must appear inside a \`\`\`${fence} fence. ` +
      "Outside the fence, :::ignore is treated as prose and has no effect.\n\n" +
      "Only warnings (W-prefix) and hints (H-prefix) can be suppressed. Errors (E-prefix) are " +
      "structural — the affected block is excluded from the model and must be fixed, not ignored. " +
      `Attempting to ignore an error code emits ${rejectedCode} instead.`,
    syntax: [
      "Single-line form:",
      "  :::ignore W001 reason on one line :::",
      "",
      "Multi-line form:",
      "  :::ignore W001 reason on first line",
      "  :::",
      "",
      `Both forms must be inside a \`\`\`${fence} fence:`,
      `  \`\`\`${fence}`,
      `  ${example}`,
      "  :::",
      "  ```",
    ],
    constraints: [
      "Only W (warning) and H (hint) rule codes can be ignored.",
      `Attempting to ignore an E (error) code emits ${rejectedCode} — errors must be fixed.`,
      "An ignore directive suppresses the next matching diagnostic in the same file at or after the directive line.",
      `An unused ignore directive emits ${staleCode} (stale ignore). Remove it when the underlying issue is resolved.`,
    ],
    authoringTips: [
      "Always provide a reason — it documents why the suppression is intentional.",
      `Record each suppressed hint in ${evidenceFile} with the rule code, element id, and reason.`,
      `Run \`${cli} validate\` after adding an ignore to confirm the directive is used (no ${staleCode}).`,
      `Run \`${cli} get --type ignore\` to list all ignore directives in the workspace.`,
      "If you are suppressing a warning (W), discuss with the team first — warnings usually indicate a real gap.",
    ],
  };
}

/** Format ignore guidance as human-readable text. */
export function formatIgnoreGuidance(result: ExplainIgnoreResult): string {
  const lines: string[] = [];
  lines.push(`Directive: ${result.name}`);
  lines.push(`\n${result.description}`);

  lines.push("\nSyntax:");
  for (const line of result.syntax) {
    lines.push(line ? `  ${line}` : "");
  }

  lines.push("\nConstraints:");
  for (const c of result.constraints) {
    lines.push(`    - ${c}`);
  }

  if (result.authoringTips.length > 0) {
    lines.push("\n  Authoring tips:");
    for (const tip of result.authoringTips) {
      lines.push(`    - ${tip}`);
    }
  }

  return lines.join("\n");
}
