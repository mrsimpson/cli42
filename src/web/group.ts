// Groups a document's nodes for rendering, the same in every web view.

interface Node {
  kind: string;
}

interface Prose extends Node {
  kind: "prose";
  text: string;
  renderedHtml?: string;
}

/**
 * A render group is either
 * - a prose run: consecutive prose nodes merged into one text, optionally
 *   followed by the block they introduce ("attached" to it), with the ignore
 *   directives between prose and block; or
 * - another node on its own: a heading, a diagram, a standalone block or
 *   ignore directive.
 *
 * Grouping matters twice. Tables: the parser emits one prose node per source
 * line, and only the merged run renders as a table. Cards: the block that
 * follows a paragraph belongs to it — the prose can be swapped for the card.
 */
export type RenderGroup<N extends Node, B extends N = N, I extends N = N> =
  | {
      kind: "prose-run";
      text: string;
      /** The prose's server-rendered HTML, when every node of the run has it. */
      renderedHtml?: string;
      block: B | null;
      ignores: I[];
    }
  | { kind: "other"; node: N };

export interface GroupOptions<N extends Node, B extends N> {
  /** Whether a node is a block that prose introduces (e.g. one inside the language fence). */
  isBlock: (node: N) => node is B;
}

/** Group the nodes of a document into prose runs and other nodes (see RenderGroup). */
export function groupNodes<N extends Node, B extends N, I extends N = N>(
  nodes: readonly N[],
  options: GroupOptions<N, B>,
): RenderGroup<N, B, I>[] {
  const groups: RenderGroup<N, B, I>[] = [];
  let proseLines: string[] = [];
  let proseRendered: string[] = [];
  let pendingIgnores: I[] = [];
  let i = 0;

  function flushProse(block: B | null, ignores = pendingIgnores) {
    if (proseLines.length === 0 && !block) return;
    const renderedHtml =
      proseRendered.length === proseLines.length && proseRendered.length > 0
        ? proseRendered.join("")
        : undefined;
    groups.push({
      kind: "prose-run",
      text: proseLines.join("\n"),
      ...(renderedHtml !== undefined ? { renderedHtml } : {}),
      block,
      ignores,
    });
    proseLines = [];
    proseRendered = [];
    if (block) pendingIgnores = [];
  }

  while (i < nodes.length) {
    const node = nodes[i]!;

    if (node.kind === "prose") {
      const prose = node as unknown as Prose;
      proseLines.push(prose.text);
      if (prose.renderedHtml !== undefined) proseRendered.push(prose.renderedHtml);
      i++;
      // Ignore directives between prose and its block belong to that block.
      while (nodes[i]?.kind === "ignore") {
        pendingIgnores.push(nodes[i] as unknown as I);
        i++;
      }
      const next = nodes[i];
      if (next && options.isBlock(next)) {
        flushProse(next, pendingIgnores);
        i++;
      }
      continue;
    }

    if (proseLines.length > 0) flushProse(null);

    if (node.kind === "ignore") {
      pendingIgnores.push(node as unknown as I);
      i++;
      continue;
    }

    if (options.isBlock(node)) {
      // A block without prose before it: a run with empty text.
      groups.push({ kind: "prose-run", text: "", block: node, ignores: pendingIgnores });
      pendingIgnores = [];
    } else {
      for (const ignore of pendingIgnores) groups.push({ kind: "other", node: ignore });
      pendingIgnores = [];
      groups.push({ kind: "other", node });
    }
    i++;
  }

  if (proseLines.length > 0) flushProse(null);
  for (const ignore of pendingIgnores) groups.push({ kind: "other", node: ignore });
  return groups;
}
