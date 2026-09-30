/**
 * The class names of one component in styles.css: `scope("changes").segment`
 * is "c42-changes-segment". Class names are not a contract of the lib; use
 * roles, text or `data-testid` to address elements.
 */
export function scope(component: string): Readonly<Record<string, string>> {
  return new Proxy({} as Record<string, string>, {
    get: (_target, name) => (typeof name === "string" ? `c42-${component}-${name}` : undefined),
  });
}

/** Join class names, skipping empty ones. */
export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}
