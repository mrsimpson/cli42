import type {
  MermaidGrammar,
  MermaidParseRequest,
  MermaidParseResult,
  MermaidSyntaxParser,
} from "./model.ts";
import { prepareSanitizerForNode } from "./node-sanitizer.ts";

let mermaidPromise: ReturnType<typeof importMermaid> | undefined;

async function importMermaid() {
  try {
    await prepareSanitizerForNode();
  } catch {
    // Parse as before: DOMPurify errors fall back to the source without
    // presentation text (withoutBrowserText).
  }
  const { default: instance } = await import("mermaid");
  return instance;
}

function getMermaid() {
  mermaidPromise ??= importMermaid().catch((error: unknown) => {
    mermaidPromise = undefined;
    throw error;
  });
  return mermaidPromise;
}

const diagramHeaders: Record<MermaidGrammar, string[]> = {
  architecture: ["architecture-beta"],
  sequence: ["sequenceDiagram"],
  flowchart: ["flowchart", "graph"],
  class: ["classDiagram"],
  auto: [],
};

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return String(error);
}

function hasExpectedHeader(source: string, notation: MermaidGrammar): boolean {
  if (notation === "auto") return true;
  const firstLine = source.trimStart().split(/\r?\n/u, 1)[0]?.trim() ?? "";
  return diagramHeaders[notation].some((header) =>
    header === "flowchart" || header === "graph"
      ? firstLine === header || firstLine.startsWith(`${header} `)
      : firstLine === header,
  );
}

/**
 * Strips presentation text (node labels, subgraph titles, edge labels) from a
 * Mermaid source so its structure can be validated in Node environments where
 * DOMPurify is not available.
 *
 * **Design intent — why regexes and not a DOM shim:**
 * Mermaid 11.x calls `DOMPurify.addHook` while parsing label text in Node.
 * The natural fix would be to supply a jsdom window so DOMPurify has a DOM to
 * work with. We deliberately avoid that because:
 *
 * 1. jsdom is a heavy dependency (~10 MB) and introduces its own version-pinning
 *    surface against Mermaid internals.
 * 2. The linter only needs to validate *structure* (node IDs, edges, subgraph
 *    nesting) — it never renders or sanitises label text itself.
 * 3. Stripping labels before the retry is semantically correct: the stripped
 *    source is used only for the structural parse; the original source is always
 *    used for rendering and semantic validation.
 *
 * The alternative of catching the error and returning a "please quote your
 * labels" message was rejected because it would produce false-positive lint
 * failures for diagrams that are valid Mermaid and render correctly in browsers.
 *
 * The regex chain is ordered so compound delimiters (e.g. `[[`, `((`) are
 * matched before their single-character subsets (`[`, `(`) to avoid partial
 * matches leaving syntax fragments in the output.
 *
 * The original source is always parsed first; this function is only called
 * after a DOMPurify error is detected. Since Mermaid's DOMPurify is prepared
 * for Node (see node-sanitizer.ts), that happens only when the preparation
 * failed — this remains the fallback for it.
 */
function withoutBrowserText(source: string, notation: MermaidGrammar): string {
  if (notation === "flowchart") {
    return (
      source
        // WHY: Mermaid 11.17.2 calls DOMPurify for both quoted and unquoted
        // subgraph titles in Node environments. Strip both forms so the
        // structural subgraph grammar can still be validated.
        // Quoted form:  subgraph id ["Title"]
        .replace(/^(\s*subgraph\s+\S+)\s*\["[^"\n]*"\]/gmu, "$1")
        // Unquoted form: subgraph id [Title]
        .replace(/^(\s*subgraph\s+\S+)\s*\[[^\]\n]+\]/gmu, "$1")
        // Node shapes — compound forms must come before their simpler subsets.
        // ([text]) — stadium
        .replace(/\(\[[^\]\n]+\]\)/gu, "")
        // [(text)] — cylinder
        .replace(/\[\([^)\n]+\)\]/gu, "")
        // ((text)) — circle
        .replace(/\(\([^)\n]+\)\)/gu, "")
        // [[text]] — subroutine
        .replace(/\[\[[^\]\n]+\]\]/gu, "")
        // {{text}} — hexagon
        .replace(/\{\{[^}\n]+\}\}/gu, "")
        // {text} — rhombus
        .replace(/\{[^}\n]+\}/gu, "")
        // [/text/] or [\text\] — parallelogram
        .replace(/\[\/[^\n]*\/\]/gu, "")
        .replace(/\[\\[^\n]*\\\]/gu, "")
        // ["text"] — quoted rect label
        .replace(/\["[^"\n]*"\]/gu, "")
        // [text] — unquoted rect label (must come after [[]], [()], [/])
        .replace(/\[[^\]\n]+\]/gu, "")
        // ("text") — quoted round label
        .replace(/\("([^"\n]*)"\)/gu, "")
        // (text) — unquoted round label (must come after (()), ([]))
        .replace(/\([^)\n]+\)/gu, "")
        // >text] — asymmetric
        .replace(/>[^\]\n]+\]/gu, "")
        // Strip quoted pipe labels |"text"|
        .replace(/\|"[^"\n]*"\|/gu, "")
        // WHY: Mermaid 11.17.2 also calls DOMPurify when sanitizing unquoted
        // edge labels (|text without quotes|) in Node environments. The original
        // code only stripped quoted labels; this extends the fallback to also
        // strip unquoted pipe labels so the structural graph grammar can still
        // be validated.
        .replace(/\|[^|\n"]+\|/gu, "")
    );
  }

  if (notation === "sequence") {
    return source.replace(/\s+as\s+"[^"\n]*"/gu, "").replace(/:\s+[^\n]*$/gmu, ":");
  }
  return source;
}

function withoutFlowchartGroups(source: string): string {
  // WHY: Mermaid 11.17.2 still calls browser-only DOMPurify while parsing
  // subgraph titles in Node. This last-resort input is used only after the
  // original source and a label-preserving structural retry both fail with
  // that environment error. Removing group decoration lets us validate the
  // remaining node/edge grammar without changing the source used for render
  // or semantic validation; group-specific syntax remains a known limitation.
  return source.replace(/^\s*subgraph[^\n]*$/gmu, "").replace(/^\s*end\s*$/gmu, "");
}

/**
 * A syntax parser backed by Mermaid's production parser for a language's own
 * diagram notations: `grammars` maps each notation to the Mermaid grammar
 * that checks it (e.g. a SIPOC diagram is a flowchart). Results carry the
 * language's notation.
 */
export function createMermaidParser<N extends string>(
  grammars: Readonly<Record<N, MermaidGrammar>>,
): MermaidSyntaxParser<N> {
  return {
    async parse({ notation, source }): Promise<MermaidParseResult<N>> {
      const grammar = grammars[notation];
      if (!source.trim()) {
        return { ok: false, notation, message: "Diagram source must not be empty." };
      }

      if (!hasExpectedHeader(source, grammar)) {
        return {
          ok: false,
          notation,
          message: `Expected a ${grammar} Mermaid diagram header.`,
        };
      }

      try {
        const parser = await getMermaid();
        let parsed;
        try {
          parsed = await parser.parse(source, { suppressErrors: false });
        } catch (error) {
          const normalized = withoutBrowserText(source, grammar);
          const sanitizerUnavailable = /DOMPurify|purify/iu.test(normalizeError(error));
          if (!sanitizerUnavailable || normalized === source) {
            throw error;
          }
          try {
            parsed = await parser.parse(normalized, { suppressErrors: false });
          } catch (normalizedError) {
            // Mermaid sanitizes subgraph titles even after their labels are
            // removed. As a last Node-only fallback, validate the remaining
            // flowchart grammar without group decoration.
            if (
              grammar !== "flowchart" ||
              !/DOMPurify|purify/iu.test(normalizeError(normalizedError))
            ) {
              throw normalizedError;
            }
            parsed = await parser.parse(withoutFlowchartGroups(normalized), {
              suppressErrors: false,
            });
          }
        }
        return { ok: true, notation, diagramType: parsed.diagramType };
      } catch (error) {
        return { ok: false, notation, message: normalizeError(error) };
      }
    },
  };
}

const GRAMMARS: Readonly<Record<MermaidGrammar, MermaidGrammar>> = {
  architecture: "architecture",
  sequence: "sequence",
  flowchart: "flowchart",
  class: "class",
  auto: "auto",
};

/** Syntax parser for Mermaid's own grammars. */
export const mermaidSyntaxParser: MermaidSyntaxParser = createMermaidParser(GRAMMARS);

export function parseMermaid(request: MermaidParseRequest): Promise<MermaidParseResult> {
  return mermaidSyntaxParser.parse(request);
}

/**
 * Eagerly kicks off the mermaid dynamic import so it runs concurrently with
 * workspace file I/O instead of waiting until the first diagram is encountered.
 * Fire-and-forget: errors are handled by getMermaid()'s own retry logic.
 */
export function warmMermaid(): void {
  void getMermaid();
}
