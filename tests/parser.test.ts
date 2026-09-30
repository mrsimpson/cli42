// The DSL parser, as arc42 and biz42 use it: one dialect, two notations that
// must yield the same nodes.
import { describe, expect, test } from "vite-plus/test";
import {
  ASCIIDOC_LINES,
  MARKDOWN_LINES,
  parseAsciidoc,
  parseLines,
  parseMarkdown,
} from "@cli42/lib/parser";
import { DEMO_DIALECT, block, md } from "./support/demo42.ts";

const semantic = (nodes: Array<{ kind: string; text?: string }>) =>
  nodes.filter((node) => !(node.kind === "prose" && node.text === ""));

describe("parseMarkdown", () => {
  const doc = md(
    "# Services",
    "",
    "## Checkout",
    "",
    "Takes the orders.",
    "",
    ...block("service", { id: "svc-checkout", title: "Checkout", status: "live" }),
  );

  test("reads headings, prose and fenced blocks with their attributes and lines", () => {
    expect(semantic(parseMarkdown("a.demo42.md", doc, DEMO_DIALECT).nodes)).toEqual([
      { kind: "heading", level: 1, text: "Services", line: 1 },
      { kind: "heading", level: 2, text: "Checkout", line: 3 },
      { kind: "prose", text: "Takes the orders.", line: 5 },
      {
        kind: "block",
        blockType: "service",
        attributes: { id: "svc-checkout", title: "Checkout", status: "live" },
        startLine: 8,
        endLine: 12,
        inDemoFence: true,
      },
    ]);
  });

  test("keeps the file path", () => {
    expect(parseMarkdown("docs/a.demo42.md", doc, DEMO_DIALECT).filePath).toBe("docs/a.demo42.md");
  });

  test("flags a block outside the language fence", () => {
    const nodes = parseMarkdown(
      "a.demo42.md",
      md("# A", ":::service", "id: x", ":::"),
      DEMO_DIALECT,
    ).nodes;
    expect(nodes.find((node) => node.kind === "block")).toMatchObject({ inDemoFence: false });
  });

  test("builds a diagram node from :::diagram and the source fence that follows", () => {
    const nodes = parseMarkdown(
      "a.demo42.md",
      md(
        "# A",
        "```demo42",
        ":::diagram",
        "id: map",
        "title: Map",
        "notation: service-map",
        ":::",
        "```",
        "```mermaid",
        "flowchart LR",
        "  a --> b",
        "```",
      ),
      DEMO_DIALECT,
    ).nodes;
    expect(nodes.find((node) => node.kind === "diagram")).toEqual({
      kind: "diagram",
      id: "map",
      title: "Map",
      notation: "service-map",
      source: "flowchart LR\n  a --> b",
      startLine: 3,
      endLine: 12,
    });
  });

  test("reads a Mermaid fence without :::diagram as bare Mermaid", () => {
    const nodes = parseMarkdown(
      "a.demo42.md",
      md("# A", "```mermaid", "graph TD", "```"),
      DEMO_DIALECT,
    ).nodes;
    expect(nodes.find((node) => node.kind === "bare-mermaid")).toEqual({
      kind: "bare-mermaid",
      source: "graph TD",
      startLine: 2,
      endLine: 4,
    });
  });

  test("reads single-line and multi-line ignore directives", () => {
    const nodes = parseMarkdown(
      "a.demo42.md",
      md(
        "# A",
        "```demo42",
        ":::ignore H001 owned elsewhere :::",
        ":::ignore WG02 generated",
        ":::",
        "```",
      ),
      DEMO_DIALECT,
    ).nodes;
    expect(nodes.filter((node) => node.kind === "ignore")).toEqual([
      { kind: "ignore", ruleCode: "H001", reason: "owned elsewhere", startLine: 3, endLine: 3 },
      { kind: "ignore", ruleCode: "WG02", reason: "generated", startLine: 4, endLine: 5 },
    ]);
  });

  test("skips HTML comments, so templates can show example blocks", () => {
    const nodes = parseMarkdown(
      "a.demo42.md",
      md("# A", "<!--", "```demo42", ":::service", "id: example", ":::", "```", "-->"),
      DEMO_DIALECT,
    ).nodes;
    expect(nodes.some((node) => node.kind === "block")).toBe(false);
  });

  test("emits an unclosed block as a parse error sentinel, never drops it", () => {
    const nodes = parseMarkdown(
      "a.demo42.md",
      md("# A", "```demo42", ":::service", "id: x", "```"),
      DEMO_DIALECT,
    ).nodes;
    const sentinel = nodes.find((node) => node.kind === "block");
    expect(sentinel).toMatchObject({ blockType: "__parse_error__" });
  });
});

describe("code fences of other languages", () => {
  const blocks = (nodes: Array<{ kind: string }>) => nodes.filter((node) => node.kind === "block");

  test("a block inside ```ts is code, not the model — and stays in the prose", () => {
    const document = parseMarkdown(
      "a.demo42.md",
      md("# A", "```ts", ":::service", "id: example", ":::", "```", "After."),
      DEMO_DIALECT,
    );
    expect(blocks(document.nodes)).toEqual([]);
    expect(
      document.nodes
        .filter((node) => node.kind === "prose")
        .map((node) => (node as { text: string }).text),
    ).toEqual(["```ts", ":::service", "id: example", ":::", "```", "After.", ""]);
  });

  test("a ```markdown example of the DSL, language fence included, is code", () => {
    const document = parseMarkdown(
      "a.demo42.md",
      md("# A", "```markdown", "```demo42", ":::service", "id: example", ":::", "```"),
      DEMO_DIALECT,
    );
    expect(blocks(document.nodes)).toEqual([]);
  });

  test("blocks after the foreign fence are read again", () => {
    const document = parseMarkdown(
      "a.demo42.md",
      md(
        "# A",
        "```ts",
        "const x = 1;",
        "```",
        ...block("service", { id: "real", title: "Real", status: "live" }),
      ),
      DEMO_DIALECT,
    );
    expect(blocks(document.nodes)).toMatchObject([
      { blockType: "service", attributes: { id: "real" }, inDemoFence: true },
    ]);
  });

  test("a block without any fence is still read (WG05 warns about it)", () => {
    const document = parseMarkdown(
      "a.demo42.md",
      md("# A", ":::service", "id: bare", ":::"),
      DEMO_DIALECT,
    );
    expect(blocks(document.nodes)).toMatchObject([
      { attributes: { id: "bare" }, inDemoFence: false },
    ]);
  });

  test("an AsciiDoc [source,ts] listing is code", () => {
    const document = parseAsciidoc(
      "a.demo42.adoc",
      md(
        "= A",
        "[source,ts]",
        "----",
        ":::service",
        "id: example",
        ":::",
        "----",
        "[source,demo42]",
        "----",
        ":::service",
        "id: real",
        ":::",
        "----",
      ),
      DEMO_DIALECT,
    );
    expect(blocks(document.nodes)).toMatchObject([
      { attributes: { id: "real" }, inDemoFence: true },
    ]);
  });

  test("an ignore directive inside a foreign fence is code too", () => {
    const document = parseMarkdown(
      "a.demo42.md",
      md("# A", "```text", ":::ignore H001 example :::", "```"),
      DEMO_DIALECT,
    );
    expect(document.nodes.some((node) => node.kind === "ignore")).toBe(false);
  });
});

describe("parseAsciidoc", () => {
  test("yields the same nodes as the equivalent Markdown", () => {
    const markdown = md(
      "# Services",
      "",
      "## Checkout",
      "",
      "Takes the orders.",
      "",
      "```demo42",
      ":::service",
      "id: svc-checkout",
      "title: Checkout",
      "status: live",
      ":::",
      "```",
    );
    const asciidoc = md(
      "= Services",
      "",
      "== Checkout",
      "",
      "Takes the orders.",
      "",
      "[source,demo42]",
      "----",
      ":::service",
      "id: svc-checkout",
      "title: Checkout",
      "status: live",
      ":::",
      "----",
    );
    const strip = (nodes: Array<{ kind: string }>) =>
      semantic(nodes).map((node) =>
        node.kind === "block" ? { ...node, startLine: 0, endLine: 0 } : node,
      );
    expect(strip(parseAsciidoc("a.demo42.adoc", asciidoc, DEMO_DIALECT).nodes)).toEqual(
      strip(parseMarkdown("a.demo42.md", markdown, DEMO_DIALECT).nodes),
    );
  });

  test("skips line and block comments", () => {
    const nodes = parseAsciidoc(
      "a.demo42.adoc",
      md(
        "= A",
        "// a comment",
        "////",
        "[source,demo42]",
        "----",
        ":::service",
        "id: x",
        ":::",
        "----",
        "////",
      ),
      DEMO_DIALECT,
    ).nodes;
    expect(semantic(nodes)).toEqual([{ kind: "heading", level: 1, text: "A", line: 1 }]);
  });

  test("reads a diagram from [source,mermaid] after :::diagram", () => {
    const nodes = parseAsciidoc(
      "a.demo42.adoc",
      md(
        "= A",
        "[source,demo42]",
        "----",
        ":::diagram",
        "id: map",
        "notation: flowchart",
        ":::",
        "----",
        "[source,mermaid]",
        "----",
        "flowchart LR",
        "  a --> b",
        "----",
      ),
      DEMO_DIALECT,
    ).nodes;
    expect(nodes.find((node) => node.kind === "diagram")).toMatchObject({
      id: "map",
      notation: "flowchart",
      source: "flowchart LR\n  a --> b",
    });
  });
});

describe("parseLines", () => {
  test("is what parseMarkdown and parseAsciidoc run with their line notations", () => {
    const markdown = md("# A", "text");
    expect(parseLines("a.md", markdown, MARKDOWN_LINES, DEMO_DIALECT)).toEqual(
      parseMarkdown("a.md", markdown, DEMO_DIALECT),
    );
    const asciidoc = md("= A", "text");
    expect(parseLines("a.adoc", asciidoc, ASCIIDOC_LINES, DEMO_DIALECT)).toEqual(
      parseAsciidoc("a.adoc", asciidoc, DEMO_DIALECT),
    );
  });
});
