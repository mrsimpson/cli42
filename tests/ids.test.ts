// Id schemes: kinds declare their id prefixes in `.meta()`; WG08 checks
// element ids against them and `idMatcher` recognises ids in text.
import { describe, expect, test } from "vite-plus/test";
import { genericRules } from "@cli42/lib/rules";
import { idMatcher, idSchemeOf, z } from "@cli42/lib/schema";
import { createValidator } from "@cli42/lib/validator";
import type { Rule } from "@cli42/lib/validator";
import { block, buildDemoIndex, buildDemoWorkspace, md, parseDocument } from "./support/demo42.ts";
import type { ReferenceIndex, Workspace } from "./support/demo42.ts";

const SCHEMAS = {
  risk: z.object({ id: z.string() }).meta({ idPrefixes: ["risk"] }),
  capability: z.object({ id: z.string() }).meta({ idPrefixes: ["cap", "capability"] }),
  platform: z.object({ id: z.string() }).meta({ idPrefixes: ["platform"], bareId: true }),
  diagram: z.object({ id: z.string() }),
};

describe("idSchemeOf", () => {
  const scheme = idSchemeOf(SCHEMAS);

  test("lists the declared prefixes, canonical first, of kinds that declare some", () => {
    expect([...scheme.prefixes]).toEqual([
      ["risk", ["risk"]],
      ["capability", ["cap", "capability"]],
      ["platform", ["platform"]],
    ]);
  });

  test("an id follows its kind's scheme with any declared prefix and a hyphen", () => {
    expect(scheme.follows("risk", "risk-lock-in")).toBe(true);
    expect(scheme.follows("capability", "cap-billing")).toBe(true);
    expect(scheme.follows("capability", "capability-billing")).toBe(true);
    expect(scheme.follows("risk", "lock-in")).toBe(false);
    expect(scheme.follows("risk", "risk")).toBe(false);
    expect(scheme.follows("risk", "risk-")).toBe(false);
    expect(scheme.follows("risk", "risky-thing")).toBe(false);
  });

  test("a bare id is valid only for a kind that allows it", () => {
    expect(scheme.follows("platform", "platform")).toBe(true);
    expect(scheme.follows("platform", "platform-main")).toBe(true);
  });

  test("a kind without a scheme accepts every id", () => {
    expect(scheme.follows("diagram", "whatever")).toBe(true);
    expect(scheme.follows("unknown-kind", "whatever")).toBe(true);
  });

  test("kindsOf names the kinds whose scheme a token follows", () => {
    expect(scheme.kindsOf("cap-billing")).toEqual(["capability"]);
    expect(scheme.kindsOf("platform")).toEqual(["platform"]);
    expect(scheme.kindsOf("x-ray")).toEqual([]);
  });
});

describe("idMatcher", () => {
  test("accepts known ids and tokens with a declared prefix", () => {
    const isId = idMatcher(SCHEMAS, ["legacy-id"]);
    expect(isId("legacy-id")).toBe(true);
    expect(isId("risk-anything")).toBe(true);
    expect(isId("capability-x")).toBe(true);
    expect(isId("platform")).toBe(true);
    expect(isId("other-thing")).toBe(false);
    expect(isId("risk")).toBe(false);
  });
});

describe("WG08 id scheme", () => {
  const schemas = {
    system: z.object({ id: z.string() }).meta({ idPrefixes: ["sys"], bareId: true }),
    service: z.object({ id: z.string() }).meta({ idPrefixes: ["svc", "service"] }),
    team: z.object({ id: z.string() }),
  };
  const options = {
    chapters: {},
    chapterOfFile: () => null,
    fenceFlag: "inDemoFence",
    fenceDescription: () => "```demo42 fence",
  };

  function validate(...lines: string[]) {
    const validator = createValidator({
      rules: genericRules({ ...options, schemas }) as Array<Rule<Workspace, ReferenceIndex>>,
    });
    const workspace = buildDemoWorkspace([parseDocument("02-services.demo42.md", md(...lines))]);
    return validator
      .validate(workspace, buildDemoIndex(workspace))
      .filter((d) => d.code === "WG08");
  }

  test("is part of the generic rules only when the language passes its schemas", () => {
    expect(genericRules(options).map((rule) => rule.meta.code)).not.toContain("WG08");
    const rules = genericRules({ ...options, schemas });
    expect(rules.at(-1)?.meta).toMatchObject({ code: "WG08", severity: "warning" });
  });

  test("warns about an id without its kind's prefix, naming canonical and further prefixes", () => {
    const diagnostics = validate(
      "## A",
      "Text.",
      ...block("service", { id: "billing", title: "B", status: "live" }),
    );
    expect(diagnostics).toEqual([
      {
        code: "WG08",
        severity: "warning",
        message:
          "service id 'billing' does not follow its id scheme — start it with 'svc-' (or 'service-')",
        file: "02-services.demo42.md",
        line: 4,
      },
    ]);
  });

  test("accepts further prefixes, bare singleton ids and kinds without a scheme", () => {
    expect(
      validate(
        "## A",
        "Text.",
        ...block("service", { id: "service-billing", title: "B", status: "live" }),
        "## S",
        "Text.",
        ...block("system", { id: "sys", title: "S" }),
        "## T",
        "Text.",
        ...block("team", { id: "anything", title: "T" }),
      ),
    ).toEqual([]);
  });

  test("can be ignored like every warning", () => {
    expect(
      validate(
        "## A",
        "Text.",
        "```demo42",
        ":::ignore WG08 a historic id :::",
        "```",
        ...block("service", { id: "billing", title: "B", status: "live" }),
      ),
    ).toEqual([]);
  });
});
