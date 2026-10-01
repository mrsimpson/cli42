import { z } from "zod";

/** A reference from one element's field to elements of another kind. */
export interface CrossRefMeta {
  field: string;
  targetKind: string;
  cardinality: "one" | "many";
  /**
   * The relation this reference is in the model — the edge the reference
   * index records and the meta-model shows. Every reference is a relation.
   */
  relation: string;
  /**
   * "reverse" records the edge from the referenced element to this one
   * (e.g. an interface's `provider` becomes provider → interface).
   */
  direction?: "forward" | "reverse";
}

export interface FieldMeta {
  name: string;
  description: string;
  required: boolean;
  enumValues: string[] | null;
}

/** A schema of an element or diagram block: a Zod object over its attributes. */
export type BlockSchema = z.ZodObject<z.ZodRawShape> | z.ZodType;

type Def = Record<string, unknown>;

function defOf(schema: unknown): Def {
  return (schema as z.ZodType)._zod.def as unknown as Def;
}

/** The fields of an object schema, or of the object a refined schema wraps. */
export function shapeOf(schema: BlockSchema): Record<string, z.ZodType> {
  let def = defOf(schema);
  // .superRefine() and friends keep the object in the same def; pipes wrap it.
  while (def["type"] === "pipe") def = defOf(def["in"]);
  return (def["shape"] ?? {}) as Record<string, z.ZodType>;
}

/** The `.meta()` of a schema (the global registry entry), or undefined. */
export function metaOf<M extends object = Record<string, unknown>>(
  schema: z.ZodType,
): Partial<M> | undefined {
  return z.globalRegistry.get(schema) as Partial<M> | undefined;
}

/** The values of the enum a field validates against, looking through optional, default and pipes. */
function enumValuesOf(def: Def, depth = 0): string[] | null {
  if (depth > 8) return null;
  switch (def["type"]) {
    case "enum":
      return Object.keys(def["entries"] as Record<string, string>);
    case "optional":
    case "default":
    case "nullable":
      return enumValuesOf(defOf(def["innerType"]), depth + 1);
    case "pipe":
      // A pipe validates its output against the enum (e.g. a value parsed, then checked).
      return (
        enumValuesOf(defOf(def["out"]), depth + 1) ?? enumValuesOf(defOf(def["in"]), depth + 1)
      );
    default:
      return null;
  }
}

/**
 * Walk a ZodObject's shape and extract field metadata structurally.
 * - required: field def type is not "optional" and not a pipe whose input is "optional"
 * - enumValues: field (or unwrapped optional inner) def type is "enum" → entries keys
 * - description: from globalRegistry.get(field)?.description
 *
 * NOTE: This function inspects Zod v4 internal `_zod.def` structure. It is coupled to
 * the zod version pinned by this package. If Zod is upgraded, verify this function
 * still works correctly.
 */
export function deriveFields(schema: BlockSchema): FieldMeta[] {
  const fields: FieldMeta[] = [];

  for (const [name, field] of Object.entries(shapeOf(schema))) {
    const meta = metaOf<{ description: string }>(field);
    const description = meta?.description ?? name;

    const def = defOf(field);
    let required = true;
    const enumValues = enumValuesOf(def);

    if (def["type"] === "optional" || def["type"] === "default") {
      required = false;
    } else if (def["type"] === "pipe") {
      // splitListSchema:         pipe(optional(string), transform) → optional
      // splitListRequiredSchema: pipe(string.min(1), transform)    → required
      if (defOf(def["in"])["type"] === "optional") {
        required = false;
      }
    }

    fields.push({ name, description, required, enumValues });
  }

  return fields;
}

/**
 * The chapter of each block kind, read from a numeric field of each schema's
 * `.meta()` (e.g. `arc42Chapter`). A schema without it is a programming error.
 */
export function chaptersOf<K extends string>(
  schemas: Readonly<Record<K, z.ZodType>>,
  metaKey: string,
): Readonly<Record<K, number>> {
  return Object.fromEntries(
    (Object.entries(schemas) as [K, z.ZodType][]).map(([kind, schema]) => {
      const chapter = metaOf<Record<string, number>>(schema)?.[metaKey];
      if (chapter === undefined) {
        throw new Error(`Schema for '${kind}' is missing ${metaKey} in .meta()`);
      }
      return [kind, chapter];
    }),
  ) as Record<K, number>;
}

/**
 * Which attributes of a schema map hold sentences rather than facts: fields
 * marked `.meta({ freeText: true })` (e.g. a description). The semantic diff
 * does not treat their words as facts of the element (see
 * `DiffOptions.proseRelevance` in `@cli42/lib/diff`).
 */
export function freeTextFields(
  schemas: Readonly<Record<string, z.ZodType>>,
): (kind: string, field: string) => boolean {
  const fields = new Map(
    Object.entries(schemas).map(([kind, schema]) => [
      kind,
      new Set(
        Object.entries(shapeOf(schema as BlockSchema))
          .filter(([, field]) => metaOf<{ freeText: boolean }>(field)?.freeText === true)
          .map(([name]) => name),
      ),
    ]),
  );
  return (kind, field) => fields.get(kind)?.has(field) ?? false;
}
