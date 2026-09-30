import { describe, expect, test } from "vite-plus/test";
import { formatError } from "@cli42/lib/cli";

describe("formatError", () => {
  test("accepts a listed format", () => {
    expect(formatError("arc42 validate", "json", ["text", "json"])).toBeUndefined();
  });

  test("names the command, the value and the accepted formats", () => {
    expect(formatError("arc42 validate", "jsno", ["text", "json"])).toBe(
      "arc42 validate: unknown format 'jsno'. Use text or json.",
    );
  });

  test("lists three or more formats with a serial comma", () => {
    expect(formatError("arc42 coverage", "xml", ["text", "json", "tree"])).toBe(
      "arc42 coverage: unknown format 'xml'. Use text, json, or tree.",
    );
  });

  test("rejects the empty string", () => {
    expect(formatError("biz42 rules", "", ["text", "json"])).toBe(
      "biz42 rules: unknown format ''. Use text or json.",
    );
  });
});
