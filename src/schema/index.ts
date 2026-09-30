// Schemas of a language's blocks: Zod itself (one version for every *42
// language, so schema author and reader agree), shared field schemas,
// introspection of schemas and their `.meta()`, and the id scheme.
export { z } from "zod";
export { splitListRequiredSchema, splitListSchema } from "./lists.ts";
export { chaptersOf, deriveFields, freeTextFields, metaOf, shapeOf } from "./introspection.ts";
export type { BlockSchema, CrossRefMeta, FieldMeta } from "./introspection.ts";
export { idMatcher, idSchemeOf } from "./ids.ts";
export type { IdScheme, IdSchemeMeta } from "./ids.ts";
