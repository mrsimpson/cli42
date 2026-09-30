// Word-level change marking of the web renderers' diff view.
import { describe, expect, test } from "vite-plus/test";
import { diffTokens, markHtmlChanges, wordTokens } from "@cli42/lib/text-diff";

const MARKS = { added: "added", removed: "removed" };

describe("diffTokens", () => {
  test("keeps common runs and puts deletions before insertions", () => {
    expect(diffTokens(["a", "b", "c"], ["a", "x", "c"])).toEqual([
      { op: "equal", values: ["a"] },
      { op: "delete", values: ["b"] },
      { op: "insert", values: ["x"] },
      { op: "equal", values: ["c"] },
    ]);
  });

  test("handles empty sides", () => {
    expect(diffTokens([], ["a"])).toEqual([{ op: "insert", values: ["a"] }]);
    expect(diffTokens(["a"], [])).toEqual([{ op: "delete", values: ["a"] }]);
    expect(diffTokens([], [])).toEqual([]);
  });
});

describe("wordTokens", () => {
  test("splits words, whitespace and punctuation; ids stay whole", () => {
    expect(wordTokens("Uses svc-pay, twice.")).toEqual([
      "Uses",
      " ",
      "svc-pay",
      ",",
      " ",
      "twice",
      ".",
    ]);
  });
});

describe("markHtmlChanges", () => {
  test("marks added and removed words inside the head's markup", () => {
    expect(
      markHtmlChanges(["<p>The old service.</p>"], ["<p>The new service.</p>"], MARKS),
    ).toEqual(['<p>The <del class="removed">old</del><ins class="added">new</ins> service.</p>']);
  });

  test("leaves unchanged fragments alone", () => {
    expect(
      markHtmlChanges(["<p>Same.</p>", "<p>Old.</p>"], ["<p>Same.</p>", "<p>New.</p>"], MARKS)[0],
    ).toBe("<p>Same.</p>");
  });

  test("keeps a deleted paragraph as a whole balanced run", () => {
    const [html] = markHtmlChanges(["<p>Kept.</p><p>Gone.</p>"], ["<p>Kept.</p>"], MARKS);
    expect(html).toContain('<del class="removed">Gone.</del>');
    expect(html).toContain("<p>Kept.</p>");
  });
});
