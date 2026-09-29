// Notations of a *42 language: the adapter each notation implements, the
// prose rendering step after parsing, and detecting a workspace's notation.
export { detectNotation } from "./adapter.ts";
export type { NotationAdapter, Parser } from "./adapter.ts";
export { renderProseNodes } from "./prose-renderer.ts";
export type { ProseRenderer } from "./prose-renderer.ts";
