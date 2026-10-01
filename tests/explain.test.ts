// `arc42 explain` / `biz42 explain`: authoring guidance derived from the schemas.
import { describe, expect, test } from "vite-plus/test";
import {
  blockGuidance,
  formatBlockGuidance,
  formatBlockList,
  formatIgnoreGuidance,
  ignoreGuidance,
} from "@cli42/lib/explain";
import { ServiceSchema, TeamSchema } from "./support/demo42.ts";
import { z } from "@cli42/lib/schema";

describe("blockGuidance", () => {
  test("derives description, fields, cross-references and tips from the schema", () => {
    expect(blockGuidance(ServiceSchema, "service")).toEqual({
      description: "A deployable service.",
      requiredFields: [
        { name: "id", description: "Unique identifier", required: true, enumValues: null },
        { name: "title", description: "Name of the service", required: true, enumValues: null },
        {
          name: "status",
          description: "Lifecycle status",
          required: true,
          enumValues: ["planned", "live"],
        },
      ],
      optionalFields: [
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
      ],
      crossRefs: [
        { field: "uses", targetKind: "service", cardinality: "many" },
        { field: "part", targetKind: "system", cardinality: "one" },
      ],
      authoringTips: ["Name services after what they do."],
    });
  });

  test("formats guidance as text below a heading", () => {
    const text = formatBlockGuidance(
      "service  (demo42 ch. 2 — Services)",
      blockGuidance(ServiceSchema, "service"),
    );
    expect(text.split("\n")).toEqual([
      "service  (demo42 ch. 2 — Services)",
      "",
      "  A deployable service.",
      "",
      "  Required fields:",
      "    id             Unique identifier",
      "    title          Name of the service",
      "    status         Lifecycle status  [planned | live]",
      "",
      "  Optional fields:",
      "    uses           Comma-separated service ids this one calls",
      "    part           System this service belongs to",
      "",
      "  Cross-references:",
      "    uses           → service (comma-separated)",
      "    part           → system",
      "",
      "  Authoring tips:",
      "    - Name services after what they do.",
    ]);
  });

  test("omits empty sections", () => {
    expect(formatBlockGuidance("team", blockGuidance(TeamSchema, "team"))).not.toContain(
      "Authoring tips",
    );
  });
});

describe("formatBlockList", () => {
  test("lists block types with chapter and description", () => {
    expect(
      formatBlockList("demo42", [
        { blockType: "service", chapter: 2, description: "A deployable service." },
        { blockType: "team", chapter: 3, description: "A team." },
      ]).split("\n"),
    ).toEqual([
      "Block types (run `demo42 explain <type>` for full guidance):",
      "",
      "  service              ch.2    A deployable service.",
      "  team                 ch.3    A team.",
    ]);
  });
});

describe("ignoreGuidance", () => {
  const guidance = ignoreGuidance({
    cli: "demo42",
    document: "a demo42 document",
    fence: "demo42",
    example: ":::ignore H001 owned elsewhere",
    evidenceFile: "evidence.md",
  });

  test("fills in the language's names and the generic codes", () => {
    expect(guidance.name).toBe("ignore directive");
    expect(guidance.description).toContain("given line of a demo42 document");
    expect(guidance.description).toContain("inside a ```demo42 fence");
    expect(guidance.description).toContain("emits WG07 instead");
    expect(guidance.syntax).toContain("  :::ignore H001 owned elsewhere");
    expect(guidance.constraints).toContain(
      "An unused ignore directive emits WG06 (stale ignore). Remove it when the underlying issue is resolved.",
    );
    expect(guidance.authoringTips).toContain(
      "Run `demo42 get --type ignore` to list all ignore directives in the workspace.",
    );
    expect(guidance.authoringTips.join("\n")).toContain("evidence.md");
  });

  test("formats as text", () => {
    const text = formatIgnoreGuidance(guidance);
    expect(text.startsWith("Directive: ignore directive\n")).toBe(true);
    expect(text).toContain("\nSyntax:\n");
    expect(text).toContain("\nConstraints:\n");
  });
});

describe("id scheme in guidance", () => {
  test("a kind with idPrefixes tells how its ids start", () => {
    const schema = z
      .object({ id: z.string() })
      .meta({ description: "A capability.", idPrefixes: ["cap", "capability"] });
    const guidance = blockGuidance(schema, "capability");
    expect(guidance.idScheme).toEqual({ prefixes: ["cap", "capability"], bareId: false });
    expect(formatBlockGuidance("capability", guidance)).toContain(
      "  Id: starts with 'cap-' (or 'capability-')",
    );
    expect(blockGuidance(z.object({ id: z.string() }), "x").idScheme).toBeUndefined();
  });
});
