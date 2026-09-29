/**
 * What went wrong while building a block, as data. Each issue has a default,
 * directive message ("problem — what to do"); a language can map it to its
 * own wording.
 */
export type BuildIssue =
  | {
      kind: "missing-attribute";
      /** The block kind, or a description such as "deployment diagram". */
      subject: string;
      field: string;
      /** Allowed values of an enum field. */
      allowed?: string[];
    }
  | {
      kind: "invalid-value";
      subject: string;
      field: string;
      value: string;
      /** Allowed values of an enum field. */
      allowed?: string[];
      /** The schema's own explanation, for values that are not enum members. */
      detail?: string;
    }
  | { kind: "invalid-block"; subject: string; detail: string }
  | { kind: "unknown-attribute"; subject: string; attribute: string; known: string[] }
  | { kind: "unknown-block"; blockType: string; known: string[] };

/** Rewords a build issue; receives the default message. */
export type MessageMapper = (issue: BuildIssue, message: string) => string;

function oneOf(values: readonly string[]): string {
  return values.join(", ");
}

/** Edit distance, to suggest the attribute an author probably meant. */
function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length]!;
}

function closest(value: string, candidates: readonly string[]): string | undefined {
  const [best] = candidates
    .map((candidate) => ({ candidate, cost: distance(value, candidate) }))
    .filter(({ cost }) => cost <= 2)
    .sort((a, b) => a.cost - b.cost);
  return best?.candidate;
}

/** The default message of a build issue: the problem, then what to do. */
export function defaultMessage(issue: BuildIssue): string {
  switch (issue.kind) {
    case "missing-attribute":
      return issue.allowed
        ? `Missing required attribute '${issue.field}' on ${issue.subject} — add '${issue.field}:' with one of: ${oneOf(issue.allowed)}`
        : `Missing required attribute '${issue.field}' on ${issue.subject} — add '${issue.field}: <value>' to the block`;
    case "invalid-value":
      return issue.allowed
        ? `Invalid ${issue.field} '${issue.value}' on ${issue.subject} — use one of: ${oneOf(issue.allowed)}`
        : `Invalid value for '${issue.field}' on ${issue.subject} — ${issue.detail ?? "correct the value"}`;
    case "invalid-block":
      return `Invalid ${issue.subject} — ${issue.detail}`;
    case "unknown-attribute": {
      const suggestion = closest(issue.attribute, issue.known);
      return suggestion
        ? `Unknown attribute '${issue.attribute}' on ${issue.subject} — did you mean '${suggestion}'?`
        : `Unknown attribute '${issue.attribute}' on ${issue.subject} — remove it or use one of: ${oneOf(issue.known)}`;
    }
    case "unknown-block":
      return `Unknown block type '${issue.blockType}' — use one of: ${oneOf(issue.known)}`;
  }
}
