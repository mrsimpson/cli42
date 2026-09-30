// The React side of every *42 web view: the theme, the history and the
// version of a workspace, the changes view with its chapter diff, and the
// Mermaid diagram. The language takes part through <WebViewProvider>: its
// words (labels) and how it renders document nodes (renderNodes).
// Styles: import "@cli42/lib/web-react/styles.css" once.
export { WebViewProvider, useWebView } from "./context.tsx";
export type { Labels, NodesContent, RenderNodesProps, ViewMode, WebView } from "./context.tsx";
export { cx, scope } from "./classes.ts";
export { useTheme } from "./useTheme.ts";
export type { Theme } from "./useTheme.ts";
export { useVersion } from "./useVersion.ts";
export { useHistory, useSnapshot } from "./useHistory.ts";
export type { HistoryState, SnapshotState } from "./useHistory.ts";
export { HistoryChain, pearlState } from "./HistoryChain.tsx";
export { HistoryEntryView } from "./HistoryEntryView.tsx";
export { ChangeGroup, ChangeLinkTo, ChangesView } from "./ChangesView.tsx";
export type { ChangeExtensions, ChangeFinding, ChangeLink, ChangePayload } from "./ChangesView.tsx";
export { ChapterDiff, headingClass } from "./ChapterDiff.tsx";
export {
  ChangeCounts,
  STATUS_CLASS,
  SegmentView,
  sectionKeyOf,
  snapshotLabel,
} from "./DiffSegment.tsx";
export { MermaidDiagram } from "./MermaidDiagram.tsx";
export type { MermaidDiagramProps } from "./MermaidDiagram.tsx";
