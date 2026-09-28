import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    // One entry per subpath export: browser code (the text diff, the diff
    // view) never pulls in the Node-only Git helpers.
    entry: {
      "diff/index": "src/diff/index.ts",
      "git/index": "src/git/index.ts",
      "text-diff/index": "src/text-diff/index.ts",
    },
    dts: true,
    exports: false,
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
