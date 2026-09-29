// Validation engine: rule and diagnostic types, ignore directives, and the
// engine that runs a language's rules.
export { createValidator } from "./engine.ts";
export type { SyntaxCheck, Validator, ValidatorOptions } from "./engine.ts";
export { applyIgnoreDirectives } from "./ignore.ts";
export type { IgnoreCodes } from "./ignore.ts";
export type {
  Diagnostic,
  IgnoreDirective,
  Rule,
  RuleDocs,
  RuleMeta,
  RuleType,
  Severity,
} from "./types.ts";
