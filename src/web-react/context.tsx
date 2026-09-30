import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { marked } from "marked";

export type ViewMode = "human" | "agent";

/** A section's own model, for rendering it apart from the workspace (a diff side). */
export interface NodesContent {
  elements: ReadonlyArray<{ id: string }>;
  edges: readonly unknown[];
  diagrams?: readonly unknown[];
}

/** What a language renders: document nodes, the way its Documents view does. */
export interface RenderNodesProps {
  /** The document nodes to render, in order. */
  nodes: readonly unknown[];
  /**
   * Rendered HTML of each prose run of `nodes` (see groupNodes), in order,
   * with changed words marked; the prose's own rendering when absent.
   */
  proseHtml?: readonly string[];
  /**
   * The model the nodes belong to when it is not the workspace's: one side
   * of a changed section. Absent for nodes of the current workspace.
   */
  content?: NodesContent;
  viewMode: ViewMode;
  /** An element to open and scroll to, and the call that says it was. */
  targetElementId?: string | null;
  onTargetConsumed?: () => void;
}

/** Words of the language, where the shared views name its model. */
export interface Labels {
  /** What the documents describe, lowercase: "architecture", "business model". */
  model: string;
}

/** The language's part of the shared views: its words and its rendering of document nodes. */
export interface WebView {
  labels: Labels;
  renderNodes: (props: RenderNodesProps) => ReactNode;
  /**
   * Whether a node is a block its prose introduces (e.g. inside the language
   * fence) — as the language's renderer groups nodes (see groupNodes), so
   * changed words are marked per prose run the renderer shows.
   */
  isBlock: (node: { kind: string }) => boolean;
  /** HTML of a prose text rendered in the browser (prose without server-rendered HTML). */
  renderProse?: (text: string) => string;
}

const DEFAULT: WebView = {
  labels: { model: "model" },
  renderNodes: () => null,
  isBlock: () => false,
};

const WebViewContext = createContext<WebView>(DEFAULT);

/** Provide the language's part of the shared views to everything below. */
export function WebViewProvider({ value, children }: { value: WebView; children: ReactNode }) {
  return <WebViewContext.Provider value={value}>{children}</WebViewContext.Provider>;
}

export function useWebView(): WebView {
  return useContext(WebViewContext);
}

/** Render prose the language's way, or with marked when the language renders none. */
export function renderProseWith(view: WebView, text: string): string {
  return view.renderProse
    ? view.renderProse(text)
    : (marked.parse(text, { async: false }) as string);
}

/** "business model" → "Business model". */
export function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
