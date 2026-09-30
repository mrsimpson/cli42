// Mermaid's syntax check in Node, as arc42 (E0xx rules, @arc42/mermaid) and
// biz42 (SIPOC, turtle and strategy maps as flowcharts) use it. Several cases
// are regressions first caught downstream: Mermaid 11 sanitises labels with
// DOMPurify, which Node lacks, so the parser retries without presentation text.
import { describe, expect, test } from "vite-plus/test";
import {
  createMermaidParser,
  mermaidSyntaxParser,
  parseMermaid,
  warmMermaid,
} from "@cli42/lib/mermaid";

const MERMAID_TIMEOUT = 30_000;

const flowchart = (source: string) => parseMermaid({ notation: "flowchart", source });
const ok = { ok: true, notation: "flowchart", diagramType: "flowchart-v2" };

describe("parseMermaid", () => {
  test(
    "parses architecture-beta diagrams",
    async () => {
      warmMermaid();
      await expect(
        parseMermaid({
          notation: "architecture",
          source: [
            "architecture-beta",
            "    service npm_packages(cloud)[npm-distributed toolchain packages]",
            "    service documentation_workspace(disk)[Documentation Workspace]",
            "    npm_packages:R -- L:documentation_workspace",
          ].join("\n"),
        }),
      ).resolves.toEqual({ ok: true, notation: "architecture", diagramType: "architecture" });
    },
    MERMAID_TIMEOUT,
  );

  test("parses sequence and flowchart diagrams", async () => {
    await expect(
      parseMermaid({ notation: "sequence", source: "sequenceDiagram\n Alice->>Bob: hi" }),
    ).resolves.toMatchObject({ ok: true, diagramType: "sequence" });
    await expect(flowchart("flowchart LR\n A-->B")).resolves.toMatchObject(ok);
    await expect(flowchart("graph TD\n A-->B")).resolves.toMatchObject(ok);
  });

  // Known bug: every class diagram fails in Node with "DOMPurify.addHook is
  // not a function" — Mermaid sanitises class names, and there are no labels
  // for the fallback to strip — so `arc42 validate` / `biz42 validate` report
  // E010 on valid class diagrams. Remove `.fails` when it is fixed.
  test.fails("parses class diagrams", async () => {
    await expect(
      parseMermaid({ notation: "class", source: "classDiagram\n  class Order\n  Order --> Item" }),
    ).resolves.toMatchObject({ ok: true, notation: "class" });
  });

  test("auto accepts any diagram type", async () => {
    await expect(
      parseMermaid({ notation: "auto", source: 'pie\n "a" : 1' }),
    ).resolves.toMatchObject({
      ok: true,
      notation: "auto",
      diagramType: "pie",
    });
  });

  test("returns a failure for malformed source, never throws", async () => {
    const result = await parseMermaid({
      notation: "architecture",
      source: "architecture-beta\n service",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toBe("");
    await expect(flowchart("flowchart LR\n A -->")).resolves.toMatchObject({ ok: false });
  });

  test("rejects a notation/header mismatch before invoking Mermaid", async () => {
    await expect(
      parseMermaid({ notation: "sequence", source: "flowchart LR\n A-->B" }),
    ).resolves.toEqual({
      ok: false,
      notation: "sequence",
      message: "Expected a sequence Mermaid diagram header.",
    });
  });

  test("rejects an empty source", async () => {
    await expect(flowchart("  \n")).resolves.toEqual({
      ok: false,
      notation: "flowchart",
      message: "Diagram source must not be empty.",
    });
  });

  test("mermaidSyntaxParser is the parser parseMermaid uses", async () => {
    await expect(
      mermaidSyntaxParser.parse({ notation: "flowchart", source: "flowchart LR\n A-->B" }),
    ).resolves.toMatchObject(ok);
  });
});

describe("labels and groups in Node (DOMPurify fallback)", () => {
  test.each([
    [
      "quoted labels, stadium shape, quoted subgraph title and edge label",
      'graph TD\n  actor-architect(["Architect"])\n  subgraph system["System"]\n    bb-cli["CLI"]\n  end\n  actor-architect -->|"uses"| bb-cli',
    ],
    [
      "an unquoted pipe edge label",
      'graph TD\n  a["A"]\n  b["B"]\n  a -->|reads capability nodes| b',
    ],
    [
      "a subgraph title with special characters and unquoted edge labels",
      'graph TD\n  subgraph sys["edugo — single deployable unit"]\n    bb_cap["Capability Map"]\n    bb_data["Data Layer"]\n    bb_cicd["CI/CD Pipeline"]\n  end\n  bb_cap -->|reads capability nodes| bb_data\n  bb_cicd -->|validates schema| bb_data',
    ],
    // cli42#2 — the E014 false positive in arc42 (docToolchain/arc42-language#98)
    [
      "an unquoted subgraph title and bracket node labels",
      "flowchart LR\n    subgraph bb_system [System]\n    end\n    actor_operator[Operator] --> bb_system",
    ],
    ["an unquoted rectangle label", "flowchart LR\n  a[Checkout] --> b[Stock]"],
    ["an unquoted round label", "flowchart LR\n  a(Checkout) --> b(Stock)"],
    ["an unquoted stadium label", "flowchart LR\n  a([Checkout]) --> b"],
    ["an unquoted subroutine label", "flowchart LR\n  a[[Checkout]] --> b"],
    ["an unquoted cylinder label", "flowchart LR\n  a[(Orders)] --> b"],
    ["an unquoted circle label", "flowchart LR\n  a((Start)) --> b"],
    ["an unquoted rhombus label", "flowchart LR\n  a{Decide} --> b"],
  ])("parses a flowchart with %s", async (_, source) => {
    await expect(flowchart(source)).resolves.toMatchObject(ok);
  });

  test("still reports a structural error behind labels", async () => {
    await expect(flowchart("flowchart LR\n  a[Checkout] --> ")).resolves.toMatchObject({
      ok: false,
    });
  });
});

describe("createMermaidParser", () => {
  // biz42 draws its business diagrams as flowcharts.
  const parser = createMermaidParser({ sipoc: "flowchart", sequence: "sequence" } as const);

  test("checks a language's notation with the grammar it maps to, and keeps the notation", async () => {
    await expect(
      parser.parse({ notation: "sipoc", source: "flowchart LR\n s[Supplier] --> p[Process]" }),
    ).resolves.toEqual({
      ok: true,
      notation: "sipoc",
      diagramType: "flowchart-v2",
    });
  });

  test("names the mapped grammar in a header mismatch", async () => {
    await expect(
      parser.parse({ notation: "sipoc", source: "sequenceDiagram\n A->>B: x" }),
    ).resolves.toEqual({
      ok: false,
      notation: "sipoc",
      message: "Expected a flowchart Mermaid diagram header.",
    });
  });
});
