// Prose changes judged by what they name (docToolchain/arc42-language#90):
// with the language's schemas, a prose edit of an unchanged block is only a
// consistency finding when the changed words name a fact of the block or an
// element the model does not connect to it.
import { describe, expect, test } from "vite-plus/test";
import { consistencyFindings, diffWorkspaces } from "@cli42/lib/diff";
import type { DiffOptions } from "@cli42/lib/diff";
import { proseRelevanceOf } from "@cli42/lib/model";
import { freeTextFields } from "@cli42/lib/schema";
import { ELEMENT_SCHEMAS, block, loadWorkspaceFromFiles, md } from "./support/demo42.ts";

const FILE = "02-services.demo42.md";
const OPTIONS: DiffOptions = {
  rejectPreambleBlocks: true,
  proseRelevance: proseRelevanceOf(ELEMENT_SCHEMAS),
};

/** The services document with the Checkout section's prose, and two other services. */
const services = (prose: string, checkout: Record<string, string> = {}) =>
  loadWorkspaceFromFiles([
    {
      path: FILE,
      content: md(
        "# Services",
        "## Checkout",
        prose,
        ...block("service", {
          id: "svc-checkout",
          title: "Checkout",
          status: "live",
          uses: "svc-payment",
          ...checkout,
        }),
        "## Payment",
        "Takes the money.",
        ...block("service", { id: "svc-payment", title: "Payment", status: "live" }),
        "## Stock",
        "Counts what is left.",
        ...block("service", { id: "svc-stock", title: "Stock Keeping", status: "planned" }),
      ),
    },
  ]);

async function change(before: string, after: string, options: DiffOptions = OPTIONS) {
  const diff = diffWorkspaces(await services(before), await services(after), options);
  const checkout = diff.elements.find((element) => element.id === "svc-checkout");
  return { checkout, findings: consistencyFindings(diff.elements) };
}

describe("prose relevance", () => {
  test("describing a feature is no finding", async () => {
    const { checkout, findings } = await change(
      "Takes the orders.",
      "Takes the orders and offers gift wrapping at the last step.",
    );
    expect(checkout).toMatchObject({ status: "unchanged", proseChanged: true, proseMentions: [] });
    expect(findings).toEqual([]);
  });

  test("without proseRelevance, every prose change is a finding (the previous behaviour)", async () => {
    const { checkout, findings } = await change(
      "Takes the orders.",
      "Takes the orders and offers gift wrapping.",
      { rejectPreambleBlocks: true },
    );
    expect(checkout?.proseMentions).toBeUndefined();
    expect(findings).toMatchObject([
      {
        kind: "prose-without-block-change",
        message: "Section prose changed without changing block 'svc-checkout'.",
      },
    ]);
  });

  test("changing what the prose says about a fact of the block is a finding", async () => {
    const { findings } = await change(
      "Takes the orders. It is live.",
      "Takes the orders. It is being retired.",
    );
    expect(findings).toEqual([
      {
        kind: "prose-without-block-change",
        severity: "warning",
        file: FILE,
        line: 5,
        elementId: "svc-checkout",
        message: "Section prose changed without changing block 'svc-checkout' — it names 'live'.",
      },
    ]);
  });

  test("newly naming an element the model does not connect is a finding", async () => {
    const { checkout, findings } = await change(
      "Takes the orders.",
      "Takes the orders and reserves them with Stock Keeping.",
    );
    expect(checkout?.proseMentions).toEqual([
      { term: "Stock Keeping", element: "svc-stock", source: "element" },
    ]);
    expect(findings).toHaveLength(1);
  });

  test("naming an element by its id counts too", async () => {
    const { findings } = await change("Takes the orders.", "Takes the orders; see svc-stock.");
    expect(findings).toHaveLength(1);
  });

  test("naming an element the model connects is no finding", async () => {
    const { findings } = await change(
      "Takes the orders.",
      "Takes the orders and hands them to Payment.",
    );
    expect(findings).toEqual([]);
  });

  test("no longer naming an element is no finding: the prose says less than the model", async () => {
    const { findings } = await change(
      "Takes the orders; Stock Keeping reserves them.",
      "Takes the orders.",
    );
    expect(findings).toEqual([]);
  });

  test("an element whose kind cannot relate to the block's is not a model statement", async () => {
    const { findings } = await change(
      "Takes the orders.",
      "Takes the orders and reserves them with Stock Keeping.",
      { rejectPreambleBlocks: true, proseRelevance: { relates: () => false } },
    );
    expect(findings).toEqual([]);
  });

  test("a changed block is judged as before, prose or not", async () => {
    const diff = diffWorkspaces(
      await services("Takes the orders."),
      await services("Takes the orders.", { title: "Checkout Desk" }),
      OPTIONS,
    );
    expect(consistencyFindings(diff.elements)).toMatchObject([
      { kind: "block-without-prose-change" },
    ]);
  });
});

describe("proseRelevanceOf", () => {
  const relevance = proseRelevanceOf(ELEMENT_SCHEMAS);

  test("relates the kinds the schemas' cross-references connect, both ways", () => {
    expect(relevance.relates("service", "service")).toBe(true);
    expect(relevance.relates("service", "system")).toBe(true);
    expect(relevance.relates("system", "service")).toBe(true);
    expect(relevance.relates("service", "team")).toBe(true);
    expect(relevance.relates("system", "system")).toBe(false);
  });

  test("marks the fields declared .meta({ freeText: true })", () => {
    expect(relevance.freeText("team", "mission")).toBe(true);
    expect(relevance.freeText("team", "owns")).toBe(false);
    expect(freeTextFields(ELEMENT_SCHEMAS)("service", "title")).toBe(false);
    expect(freeTextFields(ELEMENT_SCHEMAS)("nothing", "mission")).toBe(false);
  });

  test("the words of a free-text attribute are no facts", async () => {
    const teams = (prose: string) =>
      loadWorkspaceFromFiles([
        {
          path: "03-teams.demo42.md",
          content: md(
            "# Teams",
            "## Platform",
            prose,
            ...block("team", {
              id: "team-platform",
              title: "Platform",
              mission: "Keep checkout fast",
            }),
          ),
        },
      ]);
    const base = await teams("We keep checkout fast.");
    const head = await teams("We keep it quick.");
    const diff = (options: DiffOptions) =>
      diffWorkspaces(base, head, options).elements[0]?.proseMentions;
    expect(diff({ proseRelevance: proseRelevanceOf(ELEMENT_SCHEMAS) })).toEqual([]);
    expect(diff({ proseRelevance: {} })).not.toEqual([]);
  });
});
