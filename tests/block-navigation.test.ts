// Navigating to a block: scrolled into view and kept there while the page
// settles, never opened; what was opened does not follow into another chapter.
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { blockAnchor, openIn, scrollToBlock, withOpen } from "@cli42/lib/web-react";

describe("expansion of a chapter", () => {
  const empty = { chapterKey: "a.md", open: new Set<string>() };

  test("opens and closes a block in its chapter", () => {
    const opened = withOpen(empty, "a.md", "x", true);
    expect(openIn(opened, "a.md").has("x")).toBe(true);
    expect(openIn(withOpen(opened, "a.md", "x", false), "a.md").has("x")).toBe(false);
  });

  test("nothing opened in one chapter is open in the next", () => {
    const opened = withOpen(empty, "a.md", "x", true);
    expect(openIn(opened, "b.md").size).toBe(0);
    // Opening in the next chapter starts from nothing, too.
    expect([...openIn(withOpen(opened, "b.md", "y", true), "b.md")]).toEqual(["y"]);
  });

  test("keeps the same state when nothing changes", () => {
    expect(withOpen(empty, "a.md", "x", false)).toBe(empty);
  });
});

describe("scrollToBlock", () => {
  let frames: FrameRequestCallback[];
  let now: number;
  let listeners: Map<string, () => void>;
  /** The block's top relative to the view; the page reflows by changing `layoutShift`. */
  let top: number;
  let present: boolean;
  const scrollIntoView = vi.fn();

  function runFrame(advance = 16) {
    now += advance;
    const next = frames;
    frames = [];
    for (const callback of next) callback(now);
  }

  beforeEach(() => {
    frames = [];
    now = 0;
    top = 900;
    present = true;
    listeners = new Map();
    scrollIntoView.mockReset();
    scrollIntoView.mockImplementation(() => {
      top = 0;
    });
    vi.stubGlobal("performance", { now: () => now });
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) =>
      frames.push(callback),
    );
    vi.stubGlobal("cancelAnimationFrame", () => {
      frames = [];
    });
    vi.stubGlobal("window", {
      addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
      removeEventListener: (type: string) => listeners.delete(type),
    });
    vi.stubGlobal("document", {
      getElementById: (id: string) =>
        present && id === blockAnchor("bb-x")
          ? { scrollIntoView, getBoundingClientRect: () => ({ top }) }
          : null,
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  test("scrolls the block to the top and reports once it stayed there", () => {
    const onDone = vi.fn();
    scrollToBlock("bb-x", { onDone, settleMs: 100 });
    runFrame();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
    for (let i = 0; i < 4; i++) runFrame();
    expect(onDone).not.toHaveBeenCalled();
    for (let i = 0; i < 4; i++) runFrame();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test("scrolls back when the page reflows after the first scroll", () => {
    const onDone = vi.fn();
    scrollToBlock("bb-x", { onDone, settleMs: 100 });
    runFrame();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    // A diagram renders above the block and pushes it down.
    top = 340;
    runFrame();
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(top).toBe(0);
    for (let i = 0; i < 10; i++) runFrame();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test("waits for a block that is not rendered yet", () => {
    present = false;
    scrollToBlock("bb-x");
    runFrame();
    runFrame();
    expect(scrollIntoView).not.toHaveBeenCalled();
    present = true;
    runFrame();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  test("a block at the end of the page, which cannot reach the top, counts as in place", () => {
    scrollIntoView.mockImplementation(() => {});
    top = 120;
    const onDone = vi.fn();
    scrollToBlock("bb-x", { onDone, settleMs: 100 });
    for (let i = 0; i < 12; i++) runFrame();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test("gives up when the block never appears", () => {
    present = false;
    const onDone = vi.fn();
    scrollToBlock("bb-x", { onDone, timeoutMs: 1000 });
    runFrame(500);
    expect(onDone).not.toHaveBeenCalled();
    runFrame(600);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test("the reader's own scrolling takes over", () => {
    const onDone = vi.fn();
    scrollToBlock("bb-x", { onDone });
    runFrame();
    listeners.get("wheel")?.();
    expect(onDone).toHaveBeenCalledTimes(1);
    top = 500;
    runFrame();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  test("the returned call stops it without reporting", () => {
    const onDone = vi.fn();
    const stop = scrollToBlock("bb-x", { onDone });
    stop();
    runFrame();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(listeners.size).toBe(0);
  });
});
