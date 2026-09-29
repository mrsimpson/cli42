// ProseRenderer interface and renderProseNodes post-parse step.
// Browser-safe — no Node.js imports.

/**
 * Converts raw prose source text to an HTML fragment. Each notation brings
 * its own (e.g. marked for Markdown, Asciidoctor for AsciiDoc).
 *
 * renderProse may return a Promise to support async renderers (e.g. asciidoctor).
 *
 * renderProse receives a BLOCK of consecutive prose lines joined by newlines,
 * not individual lines. Renderers must handle multi-line input correctly.
 */
export interface ProseRenderer {
  renderProse(text: string): string | Promise<string>;
}

/**
 * Post-parse step: walks all nodes of a document and populates
 * `renderedHtml` for every prose node. The prose text is never modified —
 * raw source is always preserved.
 *
 * Consecutive prose nodes are grouped and rendered together as a single block.
 * This ensures multi-line constructs (AsciiDoc tables, paragraphs with line
 * continuations, Markdown multi-line paragraphs) are rendered correctly.
 * The full rendered HTML is placed on the first node in each group;
 * subsequent nodes in the group receive an empty string so that viewers can
 * rely on one rendered entry per prose line.
 */
export async function renderProseNodes<N extends { kind: string }, Doc extends { nodes: N[] }>(
  doc: Doc,
  renderer: ProseRenderer,
): Promise<Doc> {
  const nodes = doc.nodes;
  const result: N[] = [];

  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i]!;

    if (node.kind !== "prose") {
      result.push(node);
      i++;
      continue;
    }

    // Collect a run of consecutive prose nodes
    const runStart = i;
    while (i < nodes.length && nodes[i]!.kind === "prose") {
      i++;
    }
    const run = nodes.slice(runStart, i) as unknown as Array<N & { text: string }>;

    // Render the whole group as one block
    const block = run.map((n) => n.text).join("\n");
    const renderedHtml = await renderer.renderProse(block);

    // Assign the full HTML to the first node; subsequent nodes get ""
    for (let j = 0; j < run.length; j++) {
      result.push({ ...run[j]!, renderedHtml: j === 0 ? renderedHtml : "" });
    }
  }

  return { ...doc, nodes: result };
}
