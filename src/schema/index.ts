// Schemas of a language's blocks: Zod itself (one version for every *42
// language, so schema author and reader agree), shared field schemas, and
// introspection of schemas and their `.meta()`.
export { z } from "zod";
export { splitListRequiredSchema, splitListSchema } from "./lists.ts";
export { chaptersOf, deriveFields, metaOf, shapeOf } from "./introspection.ts";
export type { BlockSchema, CrossRefMeta, FieldMeta } from "./introspection.ts";
