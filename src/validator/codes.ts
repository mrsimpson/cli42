/**
 * Codes of the findings the shared engine and its generic rules report. They
 * live in their own namespace — severity letter, "G" for generic, two digits
 * (1-based) — so they never collide with a language's own rule codes.
 */
export const GENERIC_CODES = {
  /** Duplicate element id. */
  duplicateId: "EG01",
  /** A block could not be built into an element (parse error). */
  parseError: "EG02",
  /** An element is documented outside its canonical chapter. */
  wrongChapter: "EG03",
  /** A block is not placed under any heading. */
  outsideSection: "EG04",
  /** A block has an attribute its schema does not know. */
  unknownAttribute: "WG01",
  /** A block has no prose introduction in its section. */
  withoutProse: "WG02",
  /** A section holds more than one block. */
  multipleBlocks: "WG03",
  /** A Mermaid fence has no :::diagram metadata block. */
  bareMermaid: "WG04",
  /** A block is not wrapped in the language fence. */
  outsideFence: "WG05",
  /** An ignore directive did not suppress any diagnostic. */
  staleIgnore: "WG06",
  /** An ignore directive targets an error, which cannot be suppressed. */
  rejectedIgnore: "WG07",
  /** An element id does not follow its kind's id scheme. */
  idScheme: "WG08",
} as const;
