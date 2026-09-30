// Mermaid sanitizes the text of a diagram (class names, labels, titles) with
// DOMPurify while it parses. Without a DOM, DOMPurify's factory returns early,
// before it defines `sanitize` and `addHook`, so Mermaid's parser throws
// "DOMPurify.addHook is not a function" for every class diagram and for
// labelled flowcharts in Node.
//
// The syntax check never renders: the sanitized text is thrown away. So in
// Node, Mermaid's own DOMPurify instance gets no-op hooks and a pass-through
// `sanitize`, and Mermaid parses every diagram as it does in a browser. In a
// browser, DOMPurify is supported and left alone.

interface Purify {
  isSupported?: boolean;
  sanitize?: (dirty: unknown) => string;
  addHook?: (...args: unknown[]) => void;
  removeHook?: (...args: unknown[]) => void;
  removeHooks?: (...args: unknown[]) => void;
  removeAllHooks?: () => void;
}

/**
 * Give Mermaid's DOMPurify (the ES module instance Mermaid imports) what the
 * parser needs when there is no DOM. Resolves `dompurify` from Mermaid's own
 * location, so it is the same instance in any installation layout. Throws
 * when it cannot be resolved; the caller falls back to parsing without
 * presentation text.
 */
export async function prepareSanitizerForNode(): Promise<void> {
  if (typeof document !== "undefined") return;
  const [{ createRequire }, { readFileSync }, path, { pathToFileURL }] = await Promise.all([
    import("node:module"),
    import("node:fs"),
    import("node:path"),
    import("node:url"),
  ]);
  const fromMermaid = createRequire(import.meta.resolve("mermaid"));
  // The package root of dompurify: its CommonJS entry is what require resolves.
  let root = path.dirname(fromMermaid.resolve("dompurify"));
  const manifest = (dir: string): { name?: string; exports?: unknown } => {
    try {
      return JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
    } catch {
      return {};
    }
  };
  while (manifest(root).name !== "dompurify") {
    const parent = path.dirname(root);
    if (parent === root) throw new Error("Cannot locate the dompurify package Mermaid uses");
    root = parent;
  }
  const exports = manifest(root).exports as { ".": { import: { default: string } } };
  const entry = path.join(root, exports["."].import.default);
  const purify = ((await import(pathToFileURL(entry).href)) as { default: Purify }).default;
  if (purify.isSupported !== false) return;
  const none = () => {};
  purify.addHook = none;
  purify.removeHook = none;
  purify.removeHooks = none;
  purify.removeAllHooks = none;
  // Mermaid's parser only sanitizes text.
  purify.sanitize = (dirty) => (typeof dirty === "string" ? dirty : "");
}
