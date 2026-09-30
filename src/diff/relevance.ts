/**
 * Which changes of a section's prose concern the model (docToolchain/arc42-language#90).
 *
 * Prose around a block explains the element, but it also describes features,
 * diagrams and context the model does not record. A prose edit is only
 * suspicious when the changed words name something the model states: a fact
 * of the block itself (a value of one of its attributes, e.g. its technology)
 * or another element of the workspace (by id or title). Edits that name
 * neither — a new feature described, a sentence reworded — leave the model as
 * it is, and the diff reports them without a consistency finding.
 */

import { diffTokens, wordTokens } from "../text-diff/index.ts";
import type { DiffEdge, DiffElement } from "./model.ts";

/** What the diff needs to know about the language to judge prose changes. */
export interface ProseRelevanceOptions {
  /**
   * Attributes holding sentences rather than facts (e.g. a description); their
   * words never count as facts of the block. See `freeTextFields` in
   * `@cli42/lib/schema` for the predicate derived from the schemas.
   */
  freeText?: (kind: string, field: string) => boolean;
  /**
   * Whether the meta-model relates two element kinds (either direction). An
   * element whose kind cannot relate to the block's (e.g. a glossary term) is
   * not a model statement when the prose names it. Default: every kind relates.
   */
  relates?: (kind: string, other: string) => boolean;
}

/** A term of the model that the changed prose names. */
export interface ProseMention {
  /** The term as the model states it. */
  term: string;
  /** The element it belongs to: the block itself (one of its facts) or another element. */
  element: string;
  /** "fact" — a value of one of the block's attributes; "element" — another element's id or title. */
  source: "fact" | "element";
}

interface Term {
  words: string[];
  mention: ProseMention;
  /** Only an added occurrence counts (a name the prose starts to use). */
  addedOnly: boolean;
}

/** Attributes that identify an element rather than state a fact about it. */
const IDENTITY = new Set(["id", "title", "kind", "loc"]);

/** Word tokens (letters and digits), lowercased; whitespace and punctuation are dropped. */
function words(text: string): string[] {
  return wordTokens(text)
    .filter((token) => /[\p{L}\p{N}]/u.test(token))
    .map((token) => token.toLowerCase());
}

/** A term only counts when it is specific enough to mean something on its own. */
function isSpecific(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 3 && !/^\d+$/.test(trimmed);
}

/** The facts of one attribute value: the value, and its parts ("TypeScript / React" → both). */
function factsOf(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((item): item is string => typeof item === "string")
    .flatMap((item) => [item, ...item.split(/\s+[/|;]\s+|,\s*/)])
    .map((item) => item.trim())
    .filter(isSpecific);
}

function term(text: string, mention: ProseMention, addedOnly = false): Term[] {
  const termWords = words(text);
  return termWords.length > 0 ? [{ words: termWords, mention, addedOnly }] : [];
}

/** Elements within `hops` relations of `id`, in either direction. */
function neighbourhood(id: string, edges: Iterable<DiffEdge>, hops: number): Set<string> {
  const adjacent = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    let set = adjacent.get(a);
    if (!set) adjacent.set(a, (set = new Set()));
    set.add(b);
  };
  for (const edge of edges) {
    link(edge.from, edge.to);
    link(edge.to, edge.from);
  }
  const reached = new Set([id]);
  let frontier = [id];
  for (let hop = 0; hop < hops; hop++) {
    const next: string[] = [];
    for (const current of frontier) {
      for (const other of adjacent.get(current) ?? []) {
        if (!reached.has(other)) {
          reached.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }
  return reached;
}

/**
 * The model terms a block's prose can name:
 * - the facts of the block — changed either way, the prose now states
 *   something else than the block (e.g. another technology);
 * - the id and title of every element the model does not connect to the block
 *   (no path of up to two relations, e.g. through an interface or a parent),
 *   whose kind can relate to the block's — newly named, the prose describes a
 *   relation the model lacks. Elements the model connects may be named or no
 *   longer named freely: the prose then says what the model says, or less.
 */
export function vocabularyOf(
  element: DiffElement,
  elements: Iterable<DiffElement>,
  edges: Iterable<DiffEdge>,
  options: ProseRelevanceOptions,
): Term[] {
  const terms: Term[] = [];
  for (const [field, value] of Object.entries(element)) {
    if (IDENTITY.has(field) || options.freeText?.(element.kind, field)) continue;
    for (const fact of factsOf(value)) {
      terms.push(...term(fact, { term: fact, element: element.id, source: "fact" }));
    }
  }
  const seen = neighbourhood(element.id, edges, 2);
  for (const other of elements) {
    if (seen.has(other.id)) continue;
    seen.add(other.id);
    if (options.relates && !options.relates(element.kind, other.kind)) continue;
    const title = (other as { title?: unknown }).title;
    for (const name of [other.id, ...(typeof title === "string" ? [title] : [])]) {
      if (isSpecific(name)) {
        terms.push(...term(name, { term: name, element: other.id, source: "element" }, true));
      }
    }
  }
  return terms;
}

/** Positions of the words a word-level diff marks as changed on one side. */
function changedPositions(
  before: string[],
  after: string[],
): { base: Set<number>; head: Set<number> } {
  const base = new Set<number>();
  const head = new Set<number>();
  let b = 0;
  let h = 0;
  for (const part of diffTokens(before, after)) {
    for (let i = 0; i < part.values.length; i++) {
      if (part.op === "equal") {
        b++;
        h++;
      } else if (part.op === "delete") {
        base.add(b++);
      } else {
        head.add(h++);
      }
    }
  }
  return { base, head };
}

/** True when an occurrence of `term` in `text` covers a changed word. */
function touches(text: string[], changed: Set<number>, term: string[]): boolean {
  if (changed.size === 0) return false;
  for (let start = 0; start + term.length <= text.length; start++) {
    let match = true;
    for (let i = 0; i < term.length; i++) {
      if (text[start + i] !== term[i]) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    for (let i = 0; i < term.length; i++) if (changed.has(start + i)) return true;
  }
  return false;
}

/**
 * The model terms that the change from `before` to `after` adds, removes or
 * rewrites: a term counts when one of its occurrences — in the old prose or in
 * the new, or only in the new for names the prose must not start to use —
 * overlaps a changed word.
 */
export function proseMentions(before: string, after: string, vocabulary: Term[]): ProseMention[] {
  const base = words(before);
  const head = words(after);
  const changed = changedPositions(base, head);
  const found = new Map<string, ProseMention>();
  for (const { words: termWords, mention, addedOnly } of vocabulary) {
    const key = `${mention.element}\0${mention.term}`;
    if (found.has(key)) continue;
    const removed = !addedOnly && touches(base, changed.base, termWords);
    if (removed || touches(head, changed.head, termWords)) {
      found.set(key, mention);
    }
  }
  return [...found.values()];
}
