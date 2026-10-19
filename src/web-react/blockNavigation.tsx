// Navigating to an element's block, the same in every *42 web view: the block
// is brought into view with its prose — never opened — and what a reader
// opened in one chapter does not follow them into the next.
import { createContext, createElement, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

/** The DOM id of the element a block belongs to: its prose run or its card, whichever shows. */
export const blockAnchor = (elementId: string): string => `el-${elementId}`;

export interface ScrollToBlockOptions {
  /** Give up this long after the call, when the block never appears or never settles. */
  timeoutMs?: number;
  /** The block counts as in place once it has stayed there this long. */
  settleMs?: number;
  /** Called once the block is in place, the reader took over, or the time ran out. */
  onDone?: () => void;
}

/** Events with which the reader takes the scroll position over from us. */
const READER_EVENTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;

/**
 * Bring the block of an element to the top of the view, and keep it there while
 * the page settles. A single scroll misses: the position is computed before
 * diagrams render, fonts load and the page reflows — more so when the browser
 * is zoomed in and text wraps more — and the block ends up somewhere else.
 * So the block is looked up again on every frame (it may not be rendered yet)
 * and scrolled back until it has stayed in place. The reader's own scrolling,
 * clicks and keys end it at once. Returns the call that stops it.
 */
export function scrollToBlock(elementId: string, options: ScrollToBlockOptions = {}): () => void {
  const { timeoutMs = 4000, settleMs = 400, onDone } = options;
  const started = performance.now();
  let inPlaceSince: number | null = null;
  let frame = 0;
  let finished = false;

  function finish(report: boolean) {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(frame);
    for (const type of READER_EVENTS) window.removeEventListener(type, onReader);
    if (report) onDone?.();
  }
  const onReader = () => finish(true);
  for (const type of READER_EVENTS) window.addEventListener(type, onReader, { passive: true });

  function step() {
    const now = performance.now();
    const block = document.getElementById(blockAnchor(elementId));
    if (block) {
      const before = block.getBoundingClientRect().top;
      if (Math.abs(before) > 1) {
        block.scrollIntoView({ block: "start", behavior: "instant" });
        // At the end of the page the block cannot reach the top: where it
        // stays is where it is in place.
        if (Math.abs(block.getBoundingClientRect().top - before) > 0.5) inPlaceSince = null;
      }
      inPlaceSince ??= now;
      if (now - inPlaceSince >= settleMs) return finish(true);
    }
    if (now - started >= timeoutMs) return finish(true);
    frame = requestAnimationFrame(step);
  }
  frame = requestAnimationFrame(step);
  return () => finish(false);
}

/**
 * Scroll to the block of `elementId` when it is set, and when the chapter
 * changes under it. `onDone` is where the caller forgets the target.
 */
export function useScrollToBlock(
  elementId: string | null | undefined,
  chapterKey: string,
  onDone?: () => void,
): void {
  useEffect(() => {
    if (!elementId) return;
    return scrollToBlock(elementId, { onDone });
    // onDone is the caller's setter: it must not restart the scroll.
  }, [elementId, chapterKey]); // eslint-disable-line react-hooks/exhaustive-deps
}

interface Expansion {
  chapterKey: string;
  open: ReadonlySet<string>;
}

interface BlockExpansion {
  isOpen: (elementId: string) => boolean;
  setOpen: (elementId: string, open: boolean) => void;
}

const NONE: ReadonlySet<string> = new Set();

/** What is open in a chapter: what was opened in it, nothing from another chapter. */
export function openIn(expansion: Expansion, chapterKey: string): ReadonlySet<string> {
  return expansion.chapterKey === chapterKey ? expansion.open : NONE;
}

/** The expansion with one block opened or closed in the chapter; the same one when nothing changes. */
export function withOpen(
  expansion: Expansion,
  chapterKey: string,
  elementId: string,
  shown: boolean,
): Expansion {
  const was = openIn(expansion, chapterKey);
  if (was.has(elementId) === shown) return expansion;
  const open = new Set(was);
  if (shown) open.add(elementId);
  else open.delete(elementId);
  return { chapterKey, open };
}

/**
 * Which blocks of a chapter the reader opened (prose swapped for the model
 * box). It starts empty with every chapter: each navigation leads to the
 * prose first. The state is derived from the chapter key while rendering, so
 * a chapter never shows for one render what the one before had open.
 */
export function useChapterExpansion(chapterKey: string): BlockExpansion {
  const [expansion, setExpansion] = useState<Expansion>({ chapterKey, open: NONE });
  const open = openIn(expansion, chapterKey);
  const setOpen = useCallback(
    (elementId: string, shown: boolean) =>
      setExpansion((current) => withOpen(current, chapterKey, elementId, shown)),
    [chapterKey],
  );
  return { isOpen: (elementId) => open.has(elementId), setOpen };
}

const ExpansionContext = createContext<BlockExpansion | null>(null);

/** The chapter whose prose runs share one expansion state, reset when `chapterKey` changes. */
export function ChapterExpansion({
  chapterKey,
  children,
}: {
  chapterKey: string;
  children: ReactNode;
}) {
  const expansion = useChapterExpansion(chapterKey);
  return createElement(ExpansionContext.Provider, { value: expansion }, children);
}

/**
 * Whether the block of `elementId` is open, and the call that opens or closes
 * it. Within a <ChapterExpansion> the state is the chapter's; outside of one
 * it is the component's own.
 */
export function useBlockExpansion(elementId: string): [boolean, (open: boolean) => void] {
  const chapter = useContext(ExpansionContext);
  const [own, setOwn] = useState(false);
  if (chapter) return [chapter.isOpen(elementId), (open) => chapter.setOpen(elementId, open)];
  return [own, setOwn];
}
