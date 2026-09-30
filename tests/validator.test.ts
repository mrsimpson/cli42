// The validation engine with the generic rules and a language's own rules,
// wired as arc42 and biz42 wire it (see support/demo42.ts).
import { describe, expect, test } from "vite-plus/test";
import { GENERIC_CODES as RULE_CODES, genericRules } from "@cli42/lib/rules";
import { GENERIC_CODES, applyIgnoreDirectives, createValidator } from "@cli42/lib/validator";
import type { Diagnostic, Rule } from "@cli42/lib/validator";
import {
  block,
  buildDemoWorkspace,
  md,
  mermaidSyntax,
  parseDocument,
  validateDocuments,
  validateDocumentsAsync,
} from "./support/demo42.ts";
import type { Workspace } from "./support/demo42.ts";

const SERVICES = "02-services.demo42.md";

const codes = (diagnostics: Diagnostic[]) => diagnostics.map((d) => `${d.code}@${d.line}`);

function validate(file: string, ...lines: string[]) {
  return validateDocuments([parseDocument(file, md(...lines))]);
}

const TEAM = ["## Team", "The team.", ...block("team", { id: "team", title: "T", owns: "a, b" })];

describe("generic rules", () => {
  test("a clean document has no findings", () => {
    const diagnostics = validateDocuments([
      parseDocument(
        SERVICES,
        md(
          "# Services",
          "## A",
          "The A service.",
          ...block("service", { id: "a", title: "A", status: "live" }),
        ),
      ),
      parseDocument("03-teams.demo42.md", md("# Teams", ...TEAM)),
    ]);
    expect(diagnostics).toEqual([]);
  });

  test("EG01 duplicate id", () => {
    const diagnostics = validate(
      SERVICES,
      "## A",
      "One.",
      ...block("service", { id: "a", title: "A", status: "live" }),
      "## A again",
      "Two.",
      ...block("service", { id: "a", title: "A", status: "live" }),
      ...TEAM,
    );
    expect(diagnostics.filter((d) => d.code === "EG01")).toHaveLength(1);
    expect(diagnostics.find((d) => d.code === "EG01")?.severity).toBe("error");
  });

  test("EG02 block that cannot be built", () => {
    expect(codes(validate(SERVICES, "## A", "Text.", ...block("service", { id: "a" })))).toContain(
      "EG02@4",
    );
  });

  test("EG03 element outside its chapter file", () => {
    const diagnostics = validate(
      "01-system.demo42.md",
      "## A",
      "Text.",
      ...block("service", { id: "a", title: "A", status: "live" }),
      ...TEAM,
    );
    expect(codes(diagnostics)).toContain("EG03@4");
  });

  test("EG03 does not apply to a file name without a chapter number", () => {
    const diagnostics = validate(
      "notes.demo42.md",
      "## A",
      "Text.",
      ...block("service", { id: "a", title: "A", status: "live" }),
      ...TEAM,
    );
    expect(diagnostics.some((d) => d.code === "EG03")).toBe(false);
  });

  test("EG04 block before any heading", () => {
    expect(
      codes(
        validate(SERVICES, ...block("service", { id: "a", title: "A", status: "live" }), ...TEAM),
      ),
    ).toContain("EG04@2");
  });

  test("WG01 unknown attribute", () => {
    expect(
      codes(
        validate(
          SERVICES,
          "## A",
          "Text.",
          ...block("service", { id: "a", title: "A", status: "live", sttus: "x" }),
          ...TEAM,
        ),
      ),
    ).toContain("WG01@4");
  });

  test("WG02 block without prose introduction", () => {
    expect(
      codes(
        validate(
          SERVICES,
          "## A",
          ...block("service", { id: "a", title: "A", status: "live" }),
          ...TEAM,
        ),
      ),
    ).toContain("WG02@3");
  });

  test("WG03 more than one block under a heading", () => {
    const diagnostics = validate(
      SERVICES,
      "## A",
      "Two services.",
      ...block("service", { id: "a", title: "A", status: "live" }),
      ...block("service", { id: "b", title: "B", status: "live" }),
      ...TEAM,
    );
    expect(diagnostics.some((d) => d.code === "WG03")).toBe(true);
  });

  test("WG04 Mermaid fence without :::diagram", () => {
    expect(
      codes(validate(SERVICES, "## Map", "The map.", "```mermaid", "graph TD", "```")),
    ).toEqual(["WG04@3"]);
  });

  test("WG05 block outside the fence, named with the language's fence description", () => {
    const diagnostics = validateDocuments(
      [
        parseDocument(
          SERVICES,
          md("## A", "Text.", ":::service", "id: a", "title: A", "status: live", ":::", ...TEAM),
        ),
      ],
      { fenceDescription: "[source,demo42] / ---- fence" },
    );
    expect(diagnostics.find((d) => d.code === "WG05")?.message).toBe(
      "Block 'a' is not wrapped in a [source,demo42] / ---- fence — wrap it for proper rendering",
    );
  });

  test("the generic codes are the documented ones, in code order", () => {
    const rules = genericRules({
      chapters: {},
      chapterOfFile: () => null,
      fenceFlag: "f",
      fenceDescription: () => "fence",
    });
    expect(rules.map((rule) => rule.meta.code)).toEqual([
      "EG01",
      "EG02",
      "EG03",
      "EG04",
      "WG01",
      "WG02",
      "WG03",
      "WG04",
      "WG05",
      "WG06",
      "WG07",
    ]);
    expect(RULE_CODES).toEqual(GENERIC_CODES);
    for (const rule of rules) {
      expect(rule.meta.docs.description).not.toBe("");
      expect(rule.meta.docs.rationale).not.toBe("");
    }
  });
});

describe("ignore directives", () => {
  const service = block("service", { id: "a", title: "A", status: "live" });

  test("suppress the next matching hint at or after the directive", () => {
    const diagnostics = validate(
      SERVICES,
      "## A",
      "Text.",
      "```demo42",
      ":::ignore H001 owned by the platform team :::",
      "```",
      ...service,
    );
    expect(codes(diagnostics)).toEqual([]);
  });

  test("WG06 when the directive suppresses nothing", () => {
    const diagnostics = validate(
      SERVICES,
      "## A",
      "Text.",
      ...service,
      "```demo42",
      ":::ignore H001 too late :::",
      "```",
    );
    expect(codes(diagnostics)).toEqual(["H001@4", "WG06@11"]);
  });

  test("WG07 for an error code; the error stays", () => {
    const diagnostics = validate(
      SERVICES,
      "```demo42",
      ":::ignore E001 on purpose :::",
      "```",
      "## A",
      "Text.",
      ...block("service", { id: "a", title: "A", status: "live", uses: "a" }),
    );
    expect(codes(diagnostics).sort()).toEqual(["E001@7", "H001@7", "WG07@2"].sort());
  });

  test("applyIgnoreDirectives marks the directive it used", () => {
    const directive = { ruleCode: "H001", file: "f", line: 1, used: false };
    const kept = applyIgnoreDirectives(
      [directive],
      [{ code: "H001", severity: "hint", message: "m", file: "f", line: 3 }],
      new Map(),
    );
    expect(kept).toEqual([]);
    expect(directive.used).toBe(true);
  });
});

describe("validateAsync with Mermaid's syntax check", () => {
  const diagram = (notation: string, ...source: string[]) => [
    "## Map",
    "The map.",
    "```demo42",
    ":::diagram",
    "id: map",
    `notation: ${notation}`,
    ":::",
    "```",
    "```mermaid",
    ...source,
    "```",
  ];

  test("accepts a valid diagram", async () => {
    const diagnostics = await validateDocumentsAsync([
      parseDocument(
        SERVICES,
        md(...diagram("flowchart", "flowchart LR", "  a[Checkout] --> b[(Stock)]")),
      ),
    ]);
    expect(diagnostics).toEqual([]);
  });

  test("reports a syntax error under the code of the diagram's kind", async () => {
    const diagnostics = await validateDocumentsAsync([
      parseDocument(SERVICES, md(...diagram("service-map", "flowchart LR", "  a -->"))),
    ]);
    expect(diagnostics).toMatchObject([{ code: "E002", severity: "error", line: 4 }]);
    expect(diagnostics[0]?.message).toMatch(/^Mermaid syntax error: /);
  });

  test("checks bare Mermaid fences too", async () => {
    const diagnostics = await validateDocumentsAsync([
      parseDocument(
        SERVICES,
        md("## Map", "The map.", "```mermaid", "sequenceDiagram", "  A->>", "```"),
      ),
    ]);
    expect(codes(diagnostics).sort()).toEqual(["E010@3", "WG04@3"]);
  });

  test("the sync validate runs no syntax check", () => {
    const diagnostics = validateDocuments([
      parseDocument(SERVICES, md(...diagram("service-map", "flowchart LR", "  a -->"))),
    ]);
    expect(diagnostics).toEqual([]);
  });

  test("a syntax error suppresses the diagram rule's findings within its lines", async () => {
    // A diagram rule of the language: reports a finding on the diagram's second line.
    const onDiagram: Rule<Workspace, unknown> = {
      meta: {
        code: "E003",
        severity: "error",
        type: "problem",
        docs: { description: "Unknown element in diagram", rationale: "r", recommended: true },
      },
      check: (workspace) =>
        workspace.diagrams.map((d) => ({
          code: "E003",
          severity: "error" as const,
          message: "unknown element",
          file: d.loc.file,
          line: d.loc.line + 1,
        })),
    };
    const engine = createValidator({ rules: [onDiagram], syntax: mermaidSyntax });
    const run = (...source: string[]) => {
      const workspace = buildDemoWorkspace([
        parseDocument(SERVICES, md(...diagram("service-map", ...source))),
      ]);
      return engine.validateAsync(workspace, undefined);
    };
    expect(codes(await run("flowchart LR", "  a --> b"))).toEqual(["E003@5"]);
    expect(codes(await run("flowchart LR", "  a -->"))).toEqual(["E002@4"]);
  });
});
