import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "vite-plus";

// Build one entry per subpath export, taken from package.json, so every export
// points to a built file: `./x` is built from `src/x/index.ts` to `dist/x/`.
// Browser code (the diff view, the text diff) never pulls in Node-only modules.
const { exports } = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8")) as {
  exports: Record<string, unknown>;
};
const entry = Object.fromEntries(
  Object.keys(exports)
    // Subpaths of files (`./web-react/styles.css`) are copied, not built.
    .filter((path) => path !== "./package.json" && !/\.\w+$/.test(path))
    .map((path) => [
      `${path.slice(2)}/index`,
      existsSync(`src/${path.slice(2)}/index.tsx`)
        ? `src/${path.slice(2)}/index.tsx`
        : `src/${path.slice(2)}/index.ts`,
    ]),
);

export default defineConfig({
  pack: {
    entry,
    dts: true,
    exports: false,
    // Mermaid stays a runtime dependency of the CLIs: bundling it breaks its
    // DOMPurify integration in Node.
    // React stays the app's: /web-react uses the app's copy (optional peer).
    deps: { neverBundle: ["mermaid", "react", "react-dom", /^react\//] },
    copy: [{ from: "src/web-react/styles.css", to: "dist/web-react" }],
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
