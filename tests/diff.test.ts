// The semantic diff behind `arc42 diff` / `biz42 diff` and the history view:
// element, edge and prose changes, the block/prose consistency findings, and
// the render-ready view — on payloads built the way both CLIs build them.
import { beforeAll, describe, expect, test } from "vite-plus/test";
import {
  buildDiffView,
  changeCounts,
  consistencyFindings,
  diffWorkspaces,
  isSemanticChange,
} from "@cli42/lib/diff";
import type { DiffOptions, WorkspaceDiff } from "@cli42/lib/diff";
import { block, loadWorkspaceFromFiles, md } from "./support/demo42.ts";
import type { WorkspacePayload } from "./support/demo42.ts";

const FILE = "02-services.demo42.md";
// Both CLIs refuse blocks in a document preamble (EG04).
const OPTIONS: DiffOptions = { rejectPreambleBlocks: true };

const service = (id: string, title: string, extra: Record<string, string> = {}) =>
  block("service", { id, title, status: "live", ...extra });

const load = (...lines: string[]) =>
  loadWorkspaceFromFiles([{ path: FILE, content: md(...lines) }]);

const section = (...headingPath: string[]) => ({ file: FILE, headingPath, occurrence: 1 });

describe("diffWorkspaces", () => {
  let base: WorkspacePayload;
  let head: WorkspacePayload;
  let diff: WorkspaceDiff<WorkspacePayload>;

  beforeAll(async () => {
    base = await load(
      "# Services",
      "## A",
      "The A service.",
      ...service("a", "A", { uses: "b" }),
      "## B",
      "The B service.",
      ...service("b", "B"),
      "## C",
      "The C service.",
      ...service("c", "C"),
      "## Notes",
      "Some notes.",
    );
    head = await load(
      "# Services",
      "## A",
      "The A service.",
      ...service("a", "A2"),
      "## B",
      "The B service, reworded.",
      ...service("b", "B"),
      "## D",
      "The D service.",
      ...service("d", "D"),
      "## Notes",
      "Other notes.",
    );
    diff = diffWorkspaces(base, head, OPTIONS);
  });

  test("reports modified elements with their attribute changes", () => {
    expect(diff.elements.find((change) => change.id === "a")).toEqual({
      id: "a",
      kind: "service",
      status: "modified",
      attributes: [
        { name: "title", before: "A", after: "A2" },
        { name: "uses", before: ["b"], after: [] },
      ],
      proseChanged: false,
      base: { file: FILE, line: 5 },
      head: { file: FILE, line: 5 },
      section: section("Services", "A"),
    });
  });

  test("reports an unchanged block whose section prose changed", () => {
    expect(diff.elements.find((change) => change.id === "b")).toMatchObject({
      status: "unchanged",
      attributes: [],
      proseChanged: true,
    });
  });

  test("reports added and removed elements", () => {
    expect(diff.elements.filter((c) => c.status === "added").map((c) => c.id)).toEqual(["d"]);
    expect(diff.elements.filter((c) => c.status === "removed").map((c) => c.id)).toEqual(["c"]);
  });

  test("reports edge changes", () => {
    expect(diff.edges).toEqual([
      { status: "removed", edge: { from: "a", to: "b", relation: "uses" } },
    ]);
  });

  test("reports prose-only sections separately", () => {
    expect(diff.proseSections).toEqual([
      {
        status: "modified",
        section: section("Services", "Notes"),
        base: { file: FILE, line: 30 },
        head: { file: FILE, line: 29 },
      },
    ]);
  });

  test("counts the changes per document", () => {
    expect(diff.documents).toEqual([{ file: FILE, added: 1, modified: 3, removed: 1 }]);
    expect(changeCounts(diff)).toEqual({ added: 1, modified: 3, removed: 1 });
    expect(isSemanticChange(diff)).toBe(true);
  });

  test("finds blocks and prose that did not change together", () => {
    expect(consistencyFindings(diff.elements)).toEqual([
      {
        kind: "block-without-prose-change",
        severity: "warning",
        file: FILE,
        line: 5,
        elementId: "a",
        message: "Block 'a' changed without changing its section prose.",
      },
      {
        kind: "prose-without-block-change",
        severity: "warning",
        file: FILE,
        line: 14,
        elementId: "b",
        message: "Section prose changed without changing block 'b'.",
      },
    ]);
  });

  test("reports a deleted block whose prose stayed", async () => {
    const withoutBlock = await load(
      "# Services",
      "## A",
      "The A service.",
      ...service("a", "A", { uses: "b" }),
      "## B",
      "The B service.",
      "## C",
      "The C service.",
      ...service("c", "C"),
      "## Notes",
      "Some notes.",
    );
    const findings = consistencyFindings(diffWorkspaces(base, withoutBlock, OPTIONS).elements);
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "block-without-prose-change",
        elementId: "b",
        message: "Block 'b' was deleted without deleting its section prose.",
      }),
    );
  });

  test("an identical snapshot is no change", () => {
    const same = diffWorkspaces(base, base, OPTIONS);
    expect(same).toEqual({
      elements: [],
      diagrams: [],
      edges: [],
      proseSections: [],
      documents: [],
    });
    expect(isSemanticChange(same)).toBe(false);
  });

  test("reformatting a block is no semantic change", async () => {
    const reformatted = await load(
      "# Services",
      "## A",
      "The A service.",
      "```demo42",
      ":::service",
      "uses:   b",
      "status: live",
      "title: A",
      "id: a",
      ":::",
      "```",
      "## B",
      "The B service.",
      ...service("b", "B"),
      "## C",
      "The C service.",
      ...service("c", "C"),
      "## Notes",
      "Some notes.",
    );
    expect(isSemanticChange(diffWorkspaces(base, reformatted, OPTIONS))).toBe(false);
  });

  test("with rejectPreambleBlocks, a block before any heading is refused", async () => {
    const preamble = await load(...service("x", "X"), "# Services");
    expect(() => diffWorkspaces(preamble, preamble, OPTIONS)).toThrow();
  });

  test("reports diagram changes", async () => {
    const withDiagram = (source: string) =>
      load(
        "# Services",
        "## Map",
        "The map.",
        "```demo42",
        ":::diagram",
        "id: map",
        "notation: flowchart",
        ":::",
        "```",
        "```mermaid",
        source,
        "```",
      );
    const changed = diffWorkspaces(
      await withDiagram("flowchart LR\n  a --> b"),
      await withDiagram("flowchart LR\n  a --> c"),
      OPTIONS,
    );
    expect(changed.diagrams).toMatchObject([
      { id: "map", status: "modified", attributes: [{ name: "source" }] },
    ]);
  });
});

describe("buildDiffView", () => {
  test("gives each changed section as a segment with its nodes, elements and edges", async () => {
    const base = await load(
      "# Services",
      "## A",
      "The A service.",
      ...service("a", "A", { uses: "b" }),
      "## B",
      "The B service.",
      ...service("b", "B"),
    );
    const head = await load(
      "# Services",
      "## A",
      "The A service.",
      ...service("a", "A2", { uses: "b" }),
      "## B",
      "The B service.",
      ...service("b", "B"),
    );
    const view = buildDiffView(base, head, diffWorkspaces(base, head, OPTIONS), {
      ...OPTIONS,
      sectionDiagrams: true,
    });
    expect(view.edges).toEqual([]);
    expect(view.documents).toHaveLength(1);
    const [document] = view.documents;
    expect(document).toMatchObject({
      file: FILE,
      title: "Services",
      added: 0,
      modified: 1,
      removed: 0,
    });
    expect(document!.segments).toHaveLength(1);
    const [segment] = document!.segments;
    expect(segment).toMatchObject({ status: "modified", section: section("Services", "A") });
    expect(segment!.elements.map((change) => change.id)).toEqual(["a"]);
    // The section's content: its own nodes (heading first), the elements it
    // defines plus their neighbours, the edges between them, its diagrams.
    expect(segment!.head!.nodes[0]).toMatchObject({ kind: "heading", text: "A" });
    expect(segment!.head!.elements.map((element) => element.id)).toEqual(["a", "b"]);
    expect(segment!.head!.edges).toEqual([{ from: "a", to: "b", relation: "uses" }]);
    expect(segment!.head!.diagrams).toEqual([]);
  });

  test("renders prose in the segments' nodes", async () => {
    const base = await load("# Services", "## Notes", "Some *notes*.");
    const head = await load("# Services", "## Notes", "Other *notes*.");
    const view = buildDiffView(base, head, undefined, OPTIONS);
    const prose = view.documents[0]!.segments[0]!.head!.nodes.find((node) => node.kind === "prose");
    expect(prose).toMatchObject({ text: "Other *notes*." });
    expect((prose as { renderedHtml?: string }).renderedHtml).toContain("<em>notes</em>");
  });

  test("outlines every section of the document, removed ones at their former place", async () => {
    const base = await load(
      "# Services",
      "## A",
      "The A service.",
      ...service("a", "A"),
      "## B",
      "The B service.",
      ...service("b", "B"),
    );
    const head = await load("# Services", "## B", "The B service.", ...service("b", "B"));
    const outline = buildDiffView(base, head, undefined, OPTIONS).documents[0]!.outline;
    expect(outline.map(({ title, status, level }) => ({ title, status, level }))).toEqual([
      { title: "Services", status: "unchanged", level: 1 },
      { title: "A", status: "removed", level: 2 },
      { title: "B", status: "unchanged", level: 2 },
    ]);
  });

  test("pairs a renamed heading by the block it defines", async () => {
    const base = await load("# Services", "## B", "The B service.", ...service("b", "B"));
    const head = await load("# Services", "## Bee", "The B service.", ...service("b", "B"));
    const [segment] = buildDiffView(base, head, undefined, OPTIONS).documents[0]!.segments;
    expect(segment).toMatchObject({ status: "modified", heading: { before: "B", after: "Bee" } });
  });
});
