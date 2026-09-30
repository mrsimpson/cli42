import type {
  MermaidGrammar,
  MermaidParseRequest,
  MermaidParseResult,
  MermaidSyntaxParser,
} from "./model.ts";
import { prepareSanitizerForNode } from "./node-sanitizer.ts";

let mermaidPromise: ReturnType<typeof importMermaid> | undefined;

async function importMermaid() {
  // Without it, Mermaid cannot parse labels, titles or class names in Node.
  // A failure here is an environment problem and is raised, not hidden.
  try {
    await prepareSanitizerForNode();
  } catch (error) {
    throw sanitizerError(normalizeError(error));
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
 * A DOMPurify error means Mermaid's sanitizer was not prepared for Node — the
 * setup is wrong, not the diagram. Typically a CLI bundles Mermaid, and with
 * it a DOMPurify copy that node-sanitizer.ts cannot reach.
 */
const SANITIZER_UNUSABLE = /purify\w*\.\w+ is not a function/iu;

function sanitizerError(message: string): Error {
  return new Error(
    `Mermaid cannot parse in Node: its DOMPurify is not prepared (${message}). ` +
      "Keep mermaid a runtime dependency of the CLI instead of bundling it.",
  );
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

      // Environment errors (Mermaid cannot load or parse at all) are raised:
      // they are not the diagram's fault.
      const parser = await getMermaid();
      try {
        const parsed = await parser.parse(source, { suppressErrors: false });
        return { ok: true, notation, diagramType: parsed.diagramType };
      } catch (error) {
        const message = normalizeError(error);
        if (SANITIZER_UNUSABLE.test(message)) throw sanitizerError(message);
        return { ok: false, notation, message };
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
 * Fire-and-forget: a failure is raised again by the first parse, which
 * retries the import.
 */
export function warmMermaid(): void {
  getMermaid().catch(() => {});
}
