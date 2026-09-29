import { readFileSync } from "node:fs";
import { defineConfig } from "vite-plus";

// Build one entry per subpath export, taken from package.json, so every export
// points to a built file: `./x` is built from `src/x/index.ts` to `dist/x/`.
// Browser code (the diff view, the text diff) never pulls in Node-only modules.
const { exports } = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8")) as {
  exports: Record<string, unknown>;
};
const entry = Object.fromEntries(
  Object.keys(exports)
    .filter((path) => path !== "./package.json")
    .map((path) => [`${path.slice(2)}/index`, `src/${path.slice(2)}/index.ts`]),
);

export default defineConfig({
  pack: {
    entry,
    dts: true,
    exports: false,
    // Mermaid stays a runtime dependency of the CLIs: bundling it breaks its
    // DOMPurify integration in Node.
    deps: { neverBundle: ["mermaid"] },
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
