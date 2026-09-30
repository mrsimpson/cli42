// The Vite plugin both web apps use to keep Asciidoctor's browser build lean.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { asciidoctorBrowserPaths } from "@cli42/lib/vite";

const require = createRequire(import.meta.url);
// The package exports no package.json; find its root from its entry point.
const entry = require.resolve("@asciidoctor/core");
const BROWSER_BUILD = join(
  entry.slice(0, entry.lastIndexOf("@asciidoctor/core") + "@asciidoctor/core".length),
  "build/browser/index.js",
);

describe("asciidoctorBrowserPaths", () => {
  const plugin = asciidoctorBrowserPaths();

  test("is a pre-transform plugin", () => {
    expect(plugin).toMatchObject({ name: "cli42:asciidoctor-browser-paths", enforce: "pre" });
  });

  test("leaves every other module alone", () => {
    expect(plugin.transform("new URL('.', import.meta.url)", "/src/main.ts")).toBeUndefined();
  });

  test("marks the Node-only URLs of the installed Asciidoctor browser build @vite-ignore", () => {
    const code = readFileSync(BROWSER_BUILD, "utf8");
    const patched = plugin.transform(code, BROWSER_BUILD);
    expect(patched).toBeDefined();
    expect(patched).toContain("new URL(/* @vite-ignore */ '.', import.meta.url)");
    expect(patched).not.toMatch(/new URL\('[^']*', import\.meta\.url\)/);
  });

  test("fails the build when Asciidoctor's URLs change", () => {
    expect(() => plugin.transform("new URL('./x', import.meta.url)", BROWSER_BUILD)).toThrow(
      /expected exactly/,
    );
  });
});
