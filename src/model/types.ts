import type { z } from "zod";
import type { IgnoreDirective } from "../validator/index.ts";

export interface SourceLocation {
  file: string;
  line: number;
  /** The text of the nearest heading that precedes this element in its source file, if any. */
  heading?: string;
  /** Prose lines between the nearest preceding heading and this element's block, if any. */
  prose?: string;
}

/**
 * The elements a schema map describes: for each block kind, the schema's
 * output plus the kind and the source location — the element union of a
 * language, derived from its schemas instead of being declared twice.
 */
export type ElementOf<S extends Readonly<Record<string, z.ZodType>>, L = SourceLocation> = {
  [K in keyof S & string]: z.output<S[K]> & { kind: K; loc: L };
}[keyof S & string];

export interface ParseError {
  message: string;
  file: string;
  line: number;
}

export interface ParseWarning {
  message: string;
  file: string;
  line: number;
}

export interface BuiltWorkspace<E, D, Doc> {
  elements: E[];
  parseErrors: ParseError[];
  /** Warnings emitted during parsing — block still parsed successfully (e.g. unknown attributes). */
  parseWarnings: ParseWarning[];
  /** Raw parsed documents — used by structure-aware validation rules. */
  documents: Doc[];
  diagrams: D[];
  /** Document-scoped ignore directives. */
  ignoreDirectives: IgnoreDirective[];
}
