import { applyIgnoreDirectives } from "./ignore.ts";
import type { Diagnostic, IgnoreDirective, Rule, RuleDocs } from "./types.ts";

/**
 * A syntax check that runs before the rules (e.g. Mermaid's parser on every
 * diagram) and suppresses the rules' follow-up findings on sources that do
 * not parse.
 */
export interface SyntaxCheck<W> {
  check(workspace: W): Promise<Diagnostic[]>;
  suppress(
    workspace: W,
    diagnostics: Diagnostic[],
    syntaxDiagnostics: readonly Diagnostic[],
  ): Diagnostic[];
}

export interface ValidatorOptions<W, I, C, D extends RuleDocs> {
  rules: readonly Rule<W, I, C, D>[];
  syntax?: SyntaxCheck<W>;
}

export interface Validator<W, I, C> {
  /** Run the rules and apply ignore directives. */
  validate(workspace: W, index: I, context?: C): Diagnostic[];
  /** Run the syntax check and the rules, then apply ignore directives. */
  validateAsync(workspace: W, index: I, context?: C): Promise<Diagnostic[]>;
}

/** Build the validation engine of a language from its rules. */
export function createValidator<
  W extends { ignoreDirectives?: IgnoreDirective[] },
  I,
  C,
  D extends RuleDocs,
>(options: ValidatorOptions<W, I, C, D>): Validator<W, I, C> {
  const rulesByCode = new Map(options.rules.map((rule) => [rule.meta.code, rule]));
  const run = (workspace: W, index: I, context?: C) =>
    options.rules.flatMap((rule) => rule.check(workspace, index, context));
  const ignore = (workspace: W, diagnostics: Diagnostic[]) =>
    applyIgnoreDirectives(workspace.ignoreDirectives ?? [], diagnostics, rulesByCode);

  return {
    validate(workspace, index, context) {
      return ignore(workspace, run(workspace, index, context));
    },
    async validateAsync(workspace, index, context) {
      const syntaxDiagnostics = options.syntax ? await options.syntax.check(workspace) : [];
      const ruleDiagnostics = run(workspace, index, context);
      const semanticDiagnostics = options.syntax
        ? options.syntax.suppress(workspace, ruleDiagnostics, syntaxDiagnostics)
        : ruleDiagnostics;
      return ignore(workspace, [...semanticDiagnostics, ...syntaxDiagnostics]);
    },
  };
}
