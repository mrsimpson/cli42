import type { Diagnostic, SyntaxCheck } from "../validator/index.ts";
import type { MermaidParseResult, MermaidSyntaxParser } from "./model.ts";

/** How one diagram's source is checked: its notation and the rule code of a syntax error. */
export interface MermaidSyntaxTarget<N extends string> {
  notation: N;
  code: string;
  /**
   * Which findings of other rules an invalid source suppresses within its
   * lines; by default those with the same code.
   */
  suppresses?: (code: string) => boolean;
}

interface CheckedDiagram {
  source: string;
  loc: { file: string; line: number };
}

interface CheckedWorkspace<D extends CheckedDiagram> {
  diagrams: D[];
  documents: Array<{
    filePath: string;
    nodes: Array<{ kind: string; source?: string; startLine?: number }>;
  }>;
}

export interface MermaidSyntaxCheckOptions<N extends string, D extends CheckedDiagram> {
  parser: MermaidSyntaxParser<N>;
  /** The target of a typed diagram; undefined when Mermaid does not check it. */
  diagram(diagram: D): MermaidSyntaxTarget<N> | undefined;
  /** The target of a bare Mermaid fence; undefined when it is not checked. */
  bare(source: string): MermaidSyntaxTarget<N> | undefined;
}

function syntaxError(
  result: MermaidParseResult<string>,
  code: string,
  file: string,
  line: number,
): Diagnostic[] {
  if (result.ok) return [];
  return [
    { code, severity: "error", message: `Mermaid syntax error: ${result.message}`, file, line },
  ];
}

/**
 * Check every Mermaid diagram of a workspace with Mermaid's production parser,
 * typed diagrams and bare fences alike. Empty typed diagrams are left to the
 * rules that own empty sources.
 */
export function mermaidSyntaxCheck<
  N extends string,
  D extends CheckedDiagram,
  W extends CheckedWorkspace<D>,
>(options: MermaidSyntaxCheckOptions<N, D>): SyntaxCheck<W> {
  return {
    async check(workspace) {
      const diagnostics: Diagnostic[] = [];
      for (const diagram of workspace.diagrams) {
        const target = options.diagram(diagram);
        if (!target || !diagram.source.trim()) continue;
        const result = await options.parser.parse({
          notation: target.notation,
          source: diagram.source,
        });
        diagnostics.push(...syntaxError(result, target.code, diagram.loc.file, diagram.loc.line));
      }
      for (const document of workspace.documents) {
        for (const node of document.nodes) {
          if (node.kind !== "bare-mermaid") continue;
          const source = node.source ?? "";
          const target = options.bare(source);
          if (!target) continue;
          const result = await options.parser.parse({ notation: target.notation, source });
          diagnostics.push(
            ...syntaxError(result, target.code, document.filePath, node.startLine ?? 0),
          );
        }
      }
      return diagnostics;
    },

    suppress(workspace, diagnostics, syntaxDiagnostics) {
      const invalidRanges = workspace.diagrams.flatMap((diagram) => {
        const target = options.diagram(diagram);
        if (!target || !diagram.source.trim()) return [];
        const failed = syntaxDiagnostics.some(
          (diagnostic) =>
            diagnostic.code === target.code &&
            diagnostic.file === diagram.loc.file &&
            diagnostic.line === diagram.loc.line,
        );
        if (!failed) return [];
        return [
          {
            suppresses: target.suppresses ?? ((code: string) => code === target.code),
            file: diagram.loc.file,
            start: diagram.loc.line,
            end: diagram.loc.line + diagram.source.split("\n").length,
          },
        ];
      });
      return diagnostics.filter(
        (diagnostic) =>
          !invalidRanges.some(
            (range) =>
              range.suppresses(diagnostic.code) &&
              range.file === diagnostic.file &&
              diagnostic.line >= range.start &&
              diagnostic.line <= range.end,
          ),
      );
    },
  };
}
