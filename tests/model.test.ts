// The schema-driven model: schemas → elements, cross-references → index, as
// arc42 and biz42 build their workspaces.
import { describe, expect, test } from "vite-plus/test";
import { buildIndex, defaultMessage, parseAttributes, relationsOf } from "@cli42/lib/model";
import {
  chaptersOf,
  deriveFields,
  metaOf,
  shapeOf,
  splitListRequiredSchema,
  splitListSchema,
  z,
} from "@cli42/lib/schema";
import {
  ELEMENT_CHAPTER,
  ELEMENT_SCHEMAS,
  ServiceSchema,
  block,
  buildDemoIndex,
  buildDemoWorkspace,
  md,
  parseDocument,
} from "./support/demo42.ts";

const FILE = "02-services.demo42.md";

function workspaceOf(...lines: string[]) {
  return buildDemoWorkspace([parseDocument(FILE, md(...lines))]);
}

describe("buildWorkspace", () => {
  test("turns a block into a typed element with its location, heading and prose", () => {
    const workspace = workspaceOf(
      "# Services",
      "## Checkout",
      "Takes the orders.",
      ...block("service", { id: "svc-a", title: "A", status: "live", uses: "svc-b, svc-c" }),
    );
    expect(workspace.parseErrors).toEqual([]);
    expect(workspace.elements).toEqual([
      {
        kind: "service",
        id: "svc-a",
        title: "A",
        status: "live",
        uses: ["svc-b", "svc-c"],
        loc: { file: FILE, line: 5, heading: "Checkout", prose: "Takes the orders." },
      },
    ]);
  });

  test("gives the prose to the first block only", () => {
    const workspace = workspaceOf(
      "## Services",
      "Two services.",
      ...block("service", { id: "a", title: "A", status: "live" }),
      ...block("service", { id: "b", title: "B", status: "live" }),
    );
    expect(workspace.elements.map((element) => element.loc.prose)).toEqual([
      "Two services.",
      undefined,
    ]);
  });

  test("reports a missing attribute as a directive parse error and drops the block", () => {
    const workspace = workspaceOf("## A", ...block("service", { id: "a", status: "live" }));
    expect(workspace.elements).toEqual([]);
    expect(workspace.parseErrors).toEqual([
      {
        message:
          "Missing required attribute 'title' on service — add 'title: <value>' to the block",
        file: FILE,
        line: 3,
      },
    ]);
  });

  test("names the allowed values of an enum", () => {
    const workspace = workspaceOf(
      "## A",
      ...block("service", { id: "a", title: "A", status: "gone" }),
    );
    expect(workspace.parseErrors[0]?.message).toBe(
      "Invalid status 'gone' on service — use one of: planned, live",
    );
  });

  test("rejects an unknown block type with the known ones", () => {
    const workspace = workspaceOf("## A", ...block("servise", { id: "a" }));
    expect(workspace.parseErrors[0]?.message).toBe(
      "Unknown block type 'servise' — use one of: system, service, team",
    );
  });

  test("keeps a block with an unknown attribute and warns with a suggestion", () => {
    const workspace = workspaceOf(
      "## A",
      ...block("service", { id: "a", title: "A", status: "live", sttus: "x" }),
    );
    expect(workspace.elements).toHaveLength(1);
    expect(workspace.parseWarnings).toEqual([
      {
        message: "Unknown attribute 'sttus' on service — did you mean 'status'?",
        file: FILE,
        line: 3,
      },
    ]);
  });

  test("reports an unclosed block with its start line", () => {
    const workspace = workspaceOf("## A", "```demo42", ":::service", "id: a", "```");
    expect(workspace.elements).toEqual([]);
    expect(workspace.parseErrors).toHaveLength(1);
    expect(workspace.parseErrors[0]?.line).toBe(3);
  });

  test("collects diagrams through the language's callback, and its issues as parse errors", () => {
    const workspace = workspaceOf(
      "## Map",
      "```demo42",
      ":::diagram",
      "id: map",
      "notation: flowchart",
      ":::",
      "```",
      "```mermaid",
      "flowchart LR",
      "```",
      "```demo42",
      ":::diagram",
      "notation: flowchart",
      ":::",
      "```",
    );
    expect(workspace.diagrams).toEqual([
      {
        id: "map",
        title: undefined,
        notation: "flowchart",
        source: "flowchart LR",
        loc: { file: FILE, line: 3, heading: "Map", prose: undefined },
      },
    ]);
    expect(workspace.parseErrors[0]?.message).toMatch(
      /^Missing required attribute 'id' on diagram/,
    );
  });

  test("collects ignore directives as unused", () => {
    const workspace = workspaceOf("## A", "```demo42", ":::ignore H001 not yet :::", "```");
    expect(workspace.ignoreDirectives).toEqual([
      { ruleCode: "H001", reason: "not yet", file: FILE, line: 3, used: false },
    ]);
  });

  test("keeps the documents for structure-aware rules", () => {
    const document = parseDocument(FILE, md("# A"));
    expect(buildDemoWorkspace([document]).documents).toEqual([document]);
  });
});

describe("buildIndex", () => {
  const workspace = workspaceOf(
    "## System",
    ...block("system", { id: "shop", title: "Shop" }),
    "## A",
    ...block("service", { id: "a", title: "A", status: "live", uses: "b", part: "shop" }),
    "## B",
    ...block("service", { id: "b", title: "B", status: "live" }),
    "## Team",
    ...block("team", { id: "team-x", title: "X", owns: "a, b" }),
  );
  const index = buildDemoIndex(workspace);

  test("records every declared cross-reference as an edge of its relation", () => {
    expect(index.edges).toEqual([
      { from: "a", to: "b", relation: "uses" },
      { from: "a", to: "shop", relation: "part-of" },
      { from: "a", to: "team-x", relation: "owned-by" },
      { from: "b", to: "team-x", relation: "owned-by" },
    ]);
  });

  test("turns a reverse reference around", () => {
    expect(index.refsFrom.get("team-x")).toBeUndefined();
    expect(index.refsTo.get("team-x")).toEqual(["a", "b"]);
  });

  test("indexes elements by id and references both ways", () => {
    expect(index.byId.get("a")?.kind).toBe("service");
    expect(index.refsFrom.get("a")).toEqual(["b", "shop", "team-x"]);
    expect(index.refsTo.get("b")).toEqual(["a"]);
  });

  test("keeps an unresolved reference as an edge (resolving is the language's rule)", () => {
    const dangling = buildIndex([{ kind: "service", id: "a", uses: ["ghost"] }], ELEMENT_SCHEMAS);
    expect(dangling.edges).toEqual([{ from: "a", to: "ghost", relation: "uses" }]);
    expect(dangling.byId.has("ghost")).toBe(false);
  });
});

describe("relationsOf", () => {
  test("lists the meta-model relations, reverse ones in their direction, compound targets split", () => {
    expect(relationsOf(ELEMENT_SCHEMAS)).toEqual([
      { from: "service", to: ["service"], relation: "uses", field: "uses", cardinality: "many" },
      { from: "service", to: ["system"], relation: "part-of", field: "part", cardinality: "one" },
      { from: "service", to: ["team"], relation: "owned-by", field: "owns", cardinality: "many" },
      { from: "system", to: ["team"], relation: "owned-by", field: "owns", cardinality: "many" },
    ]);
  });
});

describe("parseAttributes", () => {
  test("returns the typed data of valid attributes", () => {
    expect(
      parseAttributes(ServiceSchema, { id: "a", title: "A", status: "live" }, "service"),
    ).toEqual({
      ok: true,
      data: { id: "a", title: "A", status: "live", uses: [] },
    });
  });

  test("returns the first problem as an issue a language can reword", () => {
    const result = parseAttributes(ServiceSchema, { id: "a", title: "A" }, "service");
    expect(result).toEqual({
      ok: false,
      issue: {
        kind: "missing-attribute",
        subject: "service",
        field: "status",
        allowed: ["planned", "live"],
      },
    });
    if (!result.ok) {
      expect(defaultMessage(result.issue)).toBe(
        "Missing required attribute 'status' on service — add 'status:' with one of: planned, live",
      );
    }
  });
});

describe("schema helpers", () => {
  test("splitListSchema splits, trims and drops empty entries; absent is empty", () => {
    expect(splitListSchema.parse(" a, b ,, c ")).toEqual(["a", "b", "c"]);
    expect(splitListSchema.parse(undefined)).toEqual([]);
  });

  test("splitListRequiredSchema requires the field", () => {
    expect(splitListRequiredSchema.parse("a,b")).toEqual(["a", "b"]);
    expect(splitListRequiredSchema.safeParse(undefined).success).toBe(false);
  });

  test("chaptersOf reads each schema's chapter, and refuses a schema without one", () => {
    expect(ELEMENT_CHAPTER).toEqual({ system: 1, service: 2, team: 3 });
    expect(() => chaptersOf({ x: z.object({}) }, "demoChapter")).toThrow(
      "Schema for 'x' is missing demoChapter in .meta()",
    );
  });

  test("metaOf returns the schema's .meta()", () => {
    expect(metaOf<{ description: string }>(ServiceSchema)?.description).toBe(
      "A deployable service.",
    );
  });

  test("deriveFields tells required, optional and enum fields apart", () => {
    expect(deriveFields(ServiceSchema)).toEqual([
      { name: "id", description: "Unique identifier", required: true, enumValues: null },
      { name: "title", description: "Name of the service", required: true, enumValues: null },
      {
        name: "status",
        description: "Lifecycle status",
        required: true,
        enumValues: ["planned", "live"],
      },
      {
        name: "uses",
        description: "Comma-separated service ids this one calls",
        required: false,
        enumValues: null,
      },
      {
        name: "part",
        description: "System this service belongs to",
        required: false,
        enumValues: null,
      },
    ]);
  });

  test("shapeOf sees through refinements", () => {
    const refined = ServiceSchema.superRefine(() => {});
    expect(Object.keys(shapeOf(refined))).toEqual(["id", "title", "status", "uses", "part"]);
  });
});
