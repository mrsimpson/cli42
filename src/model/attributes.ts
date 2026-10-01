import type { z } from "zod";
import { deriveFields } from "../schema/introspection.ts";
import type { BlockSchema } from "../schema/introspection.ts";
import type { BuildIssue } from "./messages.ts";

export type AttributeResult<T> = { ok: true; data: T } | { ok: false; issue: BuildIssue };

/**
 * Validate the raw attributes of a block against its schema. The first
 * failure becomes one issue (one error per block): a missing attribute, a
 * value outside an enum, or the schema's own explanation.
 */
export function parseAttributes<S extends z.ZodType>(
  schema: S,
  attributes: Readonly<Record<string, string | readonly string[] | undefined>>,
  subject: string,
): AttributeResult<z.output<S>> {
  const result = schema.safeParse(attributes);
  if (result.success) return { ok: true, data: result.data };
  const issue = result.error.issues[0];
  if (!issue) return { ok: false, issue: { kind: "invalid-block", subject, detail: "fix it" } };
  const field = issue.path[0];
  if (typeof field !== "string") {
    return { ok: false, issue: { kind: "invalid-block", subject, detail: issue.message } };
  }
  const allowed =
    deriveFields(schema as BlockSchema).find((meta) => meta.name === field)?.enumValues ??
    undefined;
  const raw = attributes[field];
  const value = Array.isArray(raw) ? raw.join(", ") : (raw as string | undefined);
  if (value === undefined || value.trim() === "") {
    return {
      ok: false,
      issue: { kind: "missing-attribute", subject, field, ...(allowed ? { allowed } : {}) },
    };
  }
  return {
    ok: false,
    issue: {
      kind: "invalid-value",
      subject,
      field,
      value,
      ...(allowed ? { allowed } : { detail: issue.message }),
    },
  };
}
