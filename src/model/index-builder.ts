import type { z } from "zod";
import { metaOf } from "../schema/introspection.ts";
import type { CrossRefMeta } from "../schema/introspection.ts";

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
 * declares with a relation (`.meta({ crossRefs })`) becomes an edge, in the
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
    Object.entries(schemas).map(([kind, schema]) => [
      kind,
      (metaOf<{ crossRefs: CrossRefMeta[] }>(schema)?.crossRefs ?? []).filter(
        (ref) => ref.relation !== undefined,
      ),
    ]),
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
