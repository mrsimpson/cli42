// Notations and prose rendering, as the CLIs load workspaces: detect the
// notation, parse, render prose once in the backend (marked, Asciidoctor).
import { describe, expect, test } from "vite-plus/test";
import { AsciidocProseRenderer } from "@cli42/lib/asciidoc";
import { MarkdownProseRenderer, renderMarkdown } from "@cli42/lib/markdown";
import { detectNotation, parseDocumentAsync, renderProseNodes } from "@cli42/lib/notation";
import {
  NOTATIONS,
  detectWorkspaceNotation,
  loadWorkspaceFromFiles,
  md,
} from "./support/demo42.ts";

describe("detectNotation", () => {
  test("detects the notation of a workspace from its files", () => {
    expect(detectWorkspaceNotation(["01-a.demo42.adoc", "README.md"], "docs")).toBe("asciidoc");
    expect(detectWorkspaceNotation(["01-a.demo42.md"], "docs")).toBe("markdown");
  });

  test("defaults to the first notation when no file matches", () => {
    expect(detectWorkspaceNotation([], "docs")).toBe("markdown");
  });

  test("refuses a workspace that mixes notations", () => {
    expect(() =>
      detectWorkspaceNotation(["a.demo42.md", "b.demo42.adoc", "c.demo42.adoc"], "docs"),
    ).toThrow(
      "Mixed notation workspace: found both .demo42.md (1) and .demo42.adoc (2) files in docs. Use a single notation throughout the workspace.",
    );
  });

  test("works with any extension map", () => {
    expect(
      detectNotation(
        ["x.b"],
        [
          ["a", ".a"],
          ["b", ".b"],
        ] as const,
        "here",
      ),
    ).toBe("b");
  });
});

describe("prose rendering", () => {
  test("renderMarkdown renders a commit body or prose block to HTML", () => {
    expect(renderMarkdown("Because *reasons*.")).toBe("<p>Because <em>reasons</em>.</p>\n");
  });

  test("MarkdownProseRenderer renders a prose block", () => {
    expect(new MarkdownProseRenderer().renderProse("A **bold** claim.")).toContain(
      "<strong>bold</strong>",
    );
  });

  test("AsciidocProseRenderer renders AsciiDoc", async () => {
    const html = await new AsciidocProseRenderer().renderProse("A *bold* claim.");
    expect(html).toContain("<strong>bold</strong>");
  }, 30_000);

  test("renderProseNodes renders consecutive prose as one block, on its first node", async () => {
    const document = {
      filePath: "a.md",
      nodes: [
        { kind: "heading", text: "A", level: 1, line: 1 },
        { kind: "prose", text: "- one", line: 2 },
        { kind: "prose", text: "- two", line: 3 },
      ],
    };
    const rendered = await renderProseNodes(document, new MarkdownProseRenderer());
    const [, first, second] = rendered.nodes as Array<{ renderedHtml?: string; text?: string }>;
    expect(first!.renderedHtml).toContain("<li>one</li>");
    expect(first!.renderedHtml).toContain("<li>two</li>");
    expect(second!.renderedHtml).toBe("");
    // The source text is never modified.
    expect(second!.text).toBe("- two");
  });

  test("parseDocumentAsync without a renderer leaves prose unrendered", async () => {
    const document = await parseDocumentAsync(
      "a.demo42.md",
      md("# A", "Text."),
      NOTATIONS.markdown.createParser(),
    );
    expect(
      document.nodes.find((node) => node.kind === "prose" && "renderedHtml" in node),
    ).toBeUndefined();
  });

  test("a workspace loaded from AsciiDoc files carries rendered prose", async () => {
    const payload = await loadWorkspaceFromFiles([
      {
        path: "02-services.demo42.adoc",
        content: md(
          "= Services",
          "",
          "== A",
          "",
          "The _A_ service.",
          "",
          "[source,demo42]",
          "----",
          ":::service",
          "id: a",
          "title: A",
          "status: live",
          ":::",
          "----",
        ),
      },
    ]);
    expect(payload.elements.map((element) => element.id)).toEqual(["a"]);
    // A run of prose lines is rendered once, onto its first node.
    const html = payload.documents[0]!.nodes.map(
      (node) => (node as { renderedHtml?: string }).renderedHtml ?? "",
    ).join("");
    expect(html).toContain("<em>A</em>");
  }, 30_000);
});
