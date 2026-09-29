import { z } from "zod";

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Optional comma-separated list (field may be absent). */
export const splitListSchema = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? splitList(v) : []));

/** Required comma-separated list (field must be present; may be empty string → []). */
export const splitListRequiredSchema = z
  .string()
  .min(1)
  .transform((v) => (v.trim() !== "" ? splitList(v) : []));
