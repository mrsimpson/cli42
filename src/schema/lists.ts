import { z } from "zod";

function splitList(value: string | readonly string[]): string[] {
  return (typeof value === "string" ? value.split(",") : value)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * A list attribute: comma-separated (`uses: a, b`), or one item per line
 * (`uses:` followed by `- a` and `- b` lines) — then an item may contain commas.
 */
const listInput = z.union([z.string(), z.array(z.string())]);

/** Optional list (field may be absent). */
export const splitListSchema = listInput
  .optional()
  .transform((v) => (v === undefined ? [] : splitList(v)));

/** Required list (field must be present; may be empty string → []). */
export const splitListRequiredSchema = z
  .union([z.string().min(1), z.array(z.string()).min(1)])
  .transform((v) => splitList(v));
