import type { z } from "zod";
import { freeTextFields, metaOf } from "../schema/introspection.ts";
import type { CrossRefMeta } from "../schema/introspection.ts";

function crossRefsOf(schema: z.ZodType): CrossRefMeta[] {
  return metaOf<{ crossRefs: CrossRefMeta[] }>(schema)?.crossRefs ?? [];
}

/** A graph edge connecting two elements. */
export interface IndexEdge<R extends string = string> {
  from: string;
  to: string;
  /** The semantic relationship type. */
  relation: R;
}

export interface ReferenceIndex<E, R extends string = string> {
  /** id → element */
  byId: Map<string, E>;
  /** id → list of ids this element references */
  refsFrom: Map<string, string[]>;
  /** id → list of ids that reference this element */
  refsTo: Map<string, string[]>;
  /** All reference edges in the workspace */
  edges: IndexEdge<R>[];
}

/**
 * Index the references between elements. Every cross-reference a schema
 * declares (`.meta({ crossRefs })`) becomes an edge of its relation, in the
 * order the schema lists them; the element's field holds one id or a list.
 */
export function buildIndex<E extends { id: string; kind: string }, R extends string = string>(
  elements: readonly E[],
  schemas: Readonly<Record<string, z.ZodType>>,
): ReferenceIndex<E, R> {
  const byId = new Map<string, E>();
  const refsFrom = new Map<string, string[]>();
  const refsTo = new Map<string, string[]>();
  const edges: IndexEdge<R>[] = [];

  const indexed = new Map(
    Object.entries(schemas).map(([kind, schema]) => [kind, crossRefsOf(schema)]),
  );

  for (const element of elements) byId.set(element.id, element);

  function addRef(fromId: string, toId: string) {
    const from = refsFrom.get(fromId) ?? [];
    from.push(toId);
    refsFrom.set(fromId, from);

    const to = refsTo.get(toId) ?? [];
    to.push(fromId);
    refsTo.set(toId, to);
  }

  for (const element of elements) {
    for (const ref of indexed.get(element.kind) ?? []) {
      const value = (element as unknown as Record<string, unknown>)[ref.field];
      const targets = Array.isArray(value) ? (value as string[]) : value ? [value as string] : [];
      for (const target of targets) {
        const [from, to] =
          ref.direction === "reverse" ? [target, element.id] : [element.id, target];
        edges.push({ from, to, relation: ref.relation as R });
        addRef(from, to);
      }
    }
  }

  return { byId, refsFrom, refsTo, edges };
}

/** A relation between element kinds, as the meta-model shows it. */
export interface MetaRelation<K extends string = string> {
  /** The kind the relation starts at. */
  from: K;
  /** The kinds the relation can point to. */
  to: K[];
  /** The relation's name, e.g. "provides". */
  relation: string;
  /** The field that declares it (on `from`, or on the target for a reverse relation). */
  field: string;
  cardinality: "one" | "many";
}

/**
 * The relations between the element kinds of a schema map, in their direction
 * (a reverse cross-reference points from its target to the declaring kind).
 * A compound target kind ("quality-goal, constraint, or risk") resolves to
 * each kind of the schema map it names.
 */
export function relationsOf<K extends string>(
  schemas: Readonly<Record<K, z.ZodType>>,
): MetaRelation<K>[] {
  const kinds = Object.keys(schemas) as K[];
  const targets = (targetKind: string) =>
    targetKind
      .split(/,\s*(?:or\s+)?|\s+or\s+/)
      .map((token) => token.trim())
      .filter((token): token is K => (kinds as string[]).includes(token));
  return kinds.flatMap((kind) =>
    crossRefsOf(schemas[kind]).flatMap((ref) => {
      const referenced = targets(ref.targetKind);
      const common = { relation: ref.relation, field: ref.field, cardinality: ref.cardinality };
      return ref.direction === "reverse"
        ? referenced.map((target) => ({ from: target, to: [kind], ...common }))
        : [{ from: kind, to: referenced, ...common }];
    }),
  );
}

/**
 * What the semantic diff needs from a language's schemas to judge prose
 * changes (`DiffOptions.proseRelevance` in `@cli42/lib/diff`): the free-text
 * attributes (`.meta({ freeText: true })`) and which element kinds the
 * meta-model relates.
 */
export function proseRelevanceOf(schemas: Readonly<Record<string, z.ZodType>>): {
  freeText: (kind: string, field: string) => boolean;
  relates: (kind: string, other: string) => boolean;
} {
  const pairs = new Set<string>();
  for (const relation of relationsOf(schemas)) {
    for (const to of relation.to) {
      pairs.add(`${relation.from}\0${to}`);
      pairs.add(`${to}\0${relation.from}`);
    }
  }
  return {
    freeText: freeTextFields(schemas),
    relates: (kind, other) => pairs.has(`${kind}\0${other}`),
  };
}
