// Diagnostic and rule types of the validation engine. The rule shape is
// ESLint-inspired (meta.docs, type); each language extends the docs with its
// own fields (e.g. the chapter a rule belongs to).

export type Severity = "error" | "warning" | "hint";

export interface Diagnostic {
  code: string;
  severity: Severity;
  message: string;
  file: string;
  line: number;
}

/**
 * Rule type — mirrors ESLint's RuleType vocabulary:
 * - "problem"     → likely incorrect / broken (maps to error/warning)
 * - "suggestion"  → not wrong, but could be better (maps to hint)
 */
export type RuleType = "problem" | "suggestion";

/** Documentation metadata — modelled after ESLint's RulesMetaDocs. */
export interface RuleDocs {
  /** One-line description, usable in `rules` output and agent skills. */
  description: string;
  /** Why this rule exists — the design reasoning behind it. */
  rationale: string;
  /** Whether the rule is enabled by default in the built-in rule set. */
  recommended: boolean;
  /** Optional URL to extended documentation. */
  url?: string;
}

/** Full rule metadata — mirrors ESLint's RulesMeta. */
export interface RuleMeta<D extends RuleDocs = RuleDocs> {
  /** Rule code, e.g. "E001". Never changes once assigned. */
  code: string;
  /** Default severity for this rule. */
  severity: Severity;
  /** Rule type — "problem" or "suggestion". */
  type: RuleType;
  /** Human-readable docs. */
  docs: D;
}

/**
 * A single validation rule, run against the fully built workspace `W`, its
 * reference index `I` and the language's validation context `C`.
 */
export interface Rule<W, I, C = undefined, D extends RuleDocs = RuleDocs> {
  meta: RuleMeta<D>;
  check(workspace: W, index: I, context?: C): Diagnostic[];
}

/** An `:::ignore RULE [reason] :::` directive, as the model builder collects it. */
export interface IgnoreDirective {
  ruleCode: string;
  reason?: string;
  file: string;
  line: number;
  /** True if at least one diagnostic with matching code and file was suppressed. */
  used: boolean;
}
