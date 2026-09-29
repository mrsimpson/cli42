// The model of a workspace: typed elements built from parsed documents with
// the language's schemas, and directive messages for what could not be built.
export { parseAttributes } from "./attributes.ts";
export type { AttributeResult } from "./attributes.ts";
export { buildWorkspace } from "./builder.ts";
export type {
  BuildDocument,
  BuildNode,
  BuildOptions,
  DiagramContext,
  DiagramResult,
} from "./builder.ts";
export { defaultMessage } from "./messages.ts";
export type { BuildIssue, MessageMapper } from "./messages.ts";
export type {
  BuiltWorkspace,
  ElementOf,
  ParseError,
  ParseWarning,
  SourceLocation,
} from "./types.ts";
