// Notation types — browser-safe, no Node.js imports.
import type { ProseRenderer } from "./prose-renderer.ts";

/** Parses one document of a notation into the language's AST. */
export interface Parser<Doc> {
  parse(filePath: string, content: string): Doc;
}

/**
 * Encapsulates all notation-specific behavior for a workspace.
 * Selected once at discovery time and flows through the processing pipeline.
 * Adding a notation means implementing this interface — no scattered if-branches.
 */
export interface NotationAdapter<N extends string, Doc> {
  readonly notation: N;
  /** Full file suffix including the dot — e.g. ".arc42.md" or ".arc42.adoc". */
  readonly fileExtension: string;
  /** Human-readable fence description for diagnostic messages. */
  readonly fenceDescription: string;
  /** Returns true when the given filename belongs to this notation. */
  matchesFile(filename: string): boolean;
  /** Construct the parser for this notation. */
  createParser(): Parser<Doc>;
  /** Construct the prose renderer for this notation. */
  createProseRenderer(): ProseRenderer;
  /** Produce a canonical chapter filename, e.g. "01-introduction.arc42.md". */
  chapterFilename(number: number, slug: string): string;
}

/**
 * Detect the notation of a workspace from its file paths, given each
 * notation's file extension. The first notation is the default when no file
 * matches. Throws if files of several notations are present (a mixed
 * workspace is not supported).
 */
export function detectNotation<N extends string>(
  paths: readonly string[],
  extensions: ReadonlyArray<readonly [N, string]>,
  location: string,
): N {
  const counts = extensions.map(
    ([notation, extension]) =>
      [notation, extension, paths.filter((path) => path.endsWith(extension)).length] as const,
  );
  const present = counts.filter(([, , count]) => count > 0);
  if (present.length > 1) {
    const found = present.map(([, extension, count]) => `${extension} (${count})`).join(" and ");
    throw new Error(
      `Mixed notation workspace: found both ${found} files in ${location}. Use a single notation throughout the workspace.`,
    );
  }
  return present[0]?.[0] ?? extensions[0]![0];
}
