/** The Mermaid grammars the syntax boundary can check. "auto" accepts any diagram type. */
export type MermaidGrammar = "architecture" | "sequence" | "flowchart" | "class" | "auto";

export interface MermaidParseRequest<N extends string = MermaidGrammar> {
  notation: N;
  source: string;
}

export interface MermaidParseSuccess<N extends string = MermaidGrammar> {
  ok: true;
  notation: N;
  /** The diagram type selected by Mermaid's parser. */
  diagramType: string;
}

export interface MermaidParseFailure<N extends string = MermaidGrammar> {
  ok: false;
  notation: N;
  message: string;
}

export type MermaidParseResult<N extends string = MermaidGrammar> =
  | MermaidParseSuccess<N>
  | MermaidParseFailure<N>;

/**
 * Stable parser boundary consumed by semantic validators. A diagram's syntax
 * error is a failure result; an environment that cannot run Mermaid's parser
 * (e.g. Mermaid bundled into a CLI) rejects instead.
 */
export interface MermaidSyntaxParser<N extends string = MermaidGrammar> {
  parse(request: MermaidParseRequest<N>): Promise<MermaidParseResult<N>>;
}
