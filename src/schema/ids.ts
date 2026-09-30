import { metaOf } from "./introspection.ts";
import type { z } from "zod";

/**
 * The id scheme of a block kind, declared in its schema's `.meta()`:
 *
 * ```ts
 * z.object({ … }).meta({ idPrefixes: ["cap", "capability"] })
 * ```
 *
 * An id follows the scheme when it starts with one of the prefixes and a
 * hyphen (`cap-onboarding`). The first prefix is the canonical one, the one
 * templates and guidance use; further prefixes accept what workspaces already
 * use. A kind without `idPrefixes` has no scheme.
 */
export interface IdSchemeMeta {
  idPrefixes: readonly string[];
  /** The canonical prefix alone is a valid id too, e.g. a singleton's `platform`. */
  bareId: boolean;
}

/** The id schemes of a language: which kinds declare prefixes, and what an id is. */
export interface IdScheme {
  /** The declared prefixes of each kind that has a scheme, canonical first. */
  readonly prefixes: ReadonlyMap<string, readonly string[]>;
  /** Whether `id` follows the scheme of `kind`; always true for a kind without a scheme. */
  follows(kind: string, id: string): boolean;
  /** The kinds whose scheme `token` follows (none when it carries no declared prefix). */
  kindsOf(token: string): string[];
}

function carries(token: string, prefix: string): boolean {
  return token.length > prefix.length + 1 && token.startsWith(`${prefix}-`);
}

/** The id schemes the schemas of a language declare. */
export function idSchemeOf(schemas: Readonly<Record<string, z.ZodType>>): IdScheme {
  const prefixes = new Map<string, readonly string[]>();
  const bare = new Map<string, string>();
  for (const [kind, schema] of Object.entries(schemas)) {
    const meta = metaOf<IdSchemeMeta>(schema);
    const declared = meta?.idPrefixes ?? [];
    if (declared.length === 0) continue;
    prefixes.set(kind, declared);
    if (meta?.bareId === true) bare.set(kind, declared[0]!);
  }
  const follows = (kind: string, id: string): boolean => {
    const declared = prefixes.get(kind);
    if (!declared) return true;
    return bare.get(kind) === id || declared.some((prefix) => carries(id, prefix));
  };
  return {
    prefixes,
    follows,
    kindsOf: (token) => [...prefixes.keys()].filter((kind) => follows(kind, token)),
  };
}

/**
 * One definition of "this token is an id" for everything that recognises ids
 * in text — diagram rules, the prose linker: a known id of the workspace, or a
 * token that follows a declared id scheme.
 */
export function idMatcher(
  schemas: Readonly<Record<string, z.ZodType>>,
  knownIds: Iterable<string> = [],
): (token: string) => boolean {
  const scheme = idSchemeOf(schemas);
  const known = new Set(knownIds);
  return (token) => known.has(token) || scheme.kindsOf(token).length > 0;
}
