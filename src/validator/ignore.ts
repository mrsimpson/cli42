import { GENERIC_CODES } from "./codes.ts";
import type { Diagnostic, IgnoreDirective, RuleMeta } from "./types.ts";

/** Returns true if the rule code targets an error-severity rule (cannot be suppressed). */
function isErrorSeverityCode(
  ruleCode: string,
  rulesByCode: ReadonlyMap<string, { meta: Pick<RuleMeta, "severity"> }>,
): boolean {
  const upper = ruleCode.toUpperCase();
  const rule = rulesByCode.get(upper);
  if (rule) return rule.meta.severity === "error";
  // Fallback: use the prefix heuristic for unknown/future codes
  return upper[0] === "E";
}

/**
 * Apply ignore directives: each directive suppresses one matching warning or
 * hint at or after its line; unused directives and directives targeting
 * errors are reported (WG06, WG07). Marks each directive's `used` flag.
 */
export function applyIgnoreDirectives(
  directives: IgnoreDirective[],
  diagnostics: Diagnostic[],
  rulesByCode: ReadonlyMap<string, { meta: Pick<RuleMeta, "severity"> }>,
): Diagnostic[] {
  for (const directive of directives) directive.used = false;

  // Partition directives: rejected (target E-severity) vs. allowed (W/H targets)
  const rejected = directives.filter((d) => isErrorSeverityCode(d.ruleCode, rulesByCode));
  const allowed = directives.filter((d) => !isErrorSeverityCode(d.ruleCode, rulesByCode));

  const rejectedDiags: Diagnostic[] = rejected.map(
    (d): Diagnostic => ({
      code: GENERIC_CODES.rejectedIgnore,
      severity: "warning",
      message: `Cannot suppress error-severity rule '${d.ruleCode}'; only warnings (W) and hints (H) can be ignored`,
      file: d.file,
      line: d.line,
    }),
  );

  const suppressed = new Set<Diagnostic>();

  // A directive belongs to the following source element and suppresses one
  // matching finding there. Assigning in source order keeps a directive tied
  // to the nearest subsequent finding, independent of rule execution order.
  for (const directive of [...allowed].sort((a, b) => a.line - b.line)) {
    const diagnostic = diagnostics
      .filter(
        (candidate) =>
          !suppressed.has(candidate) &&
          candidate.file === directive.file &&
          candidate.code.toUpperCase() === directive.ruleCode.toUpperCase() &&
          candidate.line >= directive.line,
      )
      .sort((a, b) => a.line - b.line)[0];
    if (diagnostic) {
      directive.used = true;
      suppressed.add(diagnostic);
    }
  }

  const kept = diagnostics.filter((diagnostic) => !suppressed.has(diagnostic));

  const stale = allowed
    .filter((directive) => !directive.used)
    .map(
      (directive): Diagnostic => ({
        code: GENERIC_CODES.staleIgnore,
        severity: "warning",
        message: `Ignore directive for '${directive.ruleCode}' did not suppress any diagnostic`,
        file: directive.file,
        line: directive.line,
      }),
    );
  return [...kept, ...stale, ...rejectedDiags];
}
