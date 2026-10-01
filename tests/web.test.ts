// @cli42/lib/web: routing, slug, node grouping, id linking and the history
// format, as every *42 web view uses them.
import { describe, expect, test } from "vite-plus/test";
import { markHtmlChanges } from "@cli42/lib/text-diff";
import {
  DocumentRoutes,
  formatRoute,
  groupNodes,
  historyHref,
  linkIds,
  loadSnapshot,
  parseJsonLines,
  parseRoute,
  pearlKey,
  readHistoryIndex,
  sharePathLists,
  slug,
  toHistoryPearls,
  toJsonLines,
  WorkspaceLinks,
  linkElementIds,
} from "@cli42/lib/web";
import type { Route } from "@cli42/lib/web";

describe("routes", () => {
  const routes: Array<[string, Route]> = [
    [
      "#05-building-blocks.arc42.md",
      { view: "document", file: "05-building-blocks.arc42.md", anchor: null, element: null },
    ],
    [
      "#05-building-blocks.arc42.md:el-bb-cli",
      {
        view: "document",
        file: "05-building-blocks.arc42.md",
        anchor: "el-bb-cli",
        element: "bb-cli",
      },
    ],
    [
      "#05-building-blocks.arc42.md:level-1",
      { view: "document", file: "05-building-blocks.arc42.md", anchor: "level-1", element: null },
    ],
    [
      "#2-design/d5-transactions.pdt42.md:cv-board",
      {
        view: "document",
        file: "2-design/d5-transactions.pdt42.md",
        anchor: "cv-board",
        element: null,
      },
    ],
    ["#changes", { view: "changes" }],
    ["#history", { view: "history", key: null, message: false }],
    ["#history:worktree", { view: "history", key: "worktree", message: false }],
    ["#history:0123abcd:message", { view: "history", key: "0123abcd", message: true }],
  ];

  test.each(routes)("%s parses and formats back", (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
    expect(formatRoute(route)).toBe(hash);
  });

  test("no hash is the default document", () => {
    expect(parseRoute("")).toEqual({ view: "document", file: "", anchor: null, element: null });
    expect(parseRoute("#")).toEqual({ view: "document", file: "", anchor: null, element: null });
  });

  test("an app's own views", () => {
    expect(parseRoute("#meta-model", { views: ["meta-model"] })).toEqual({
      view: "app",
      name: "meta-model",
    });
    expect(parseRoute("#meta-model").view).toBe("document");
    expect(formatRoute({ view: "app", name: "meta-model" })).toBe("#meta-model");
  });

  test("percent-encoded files and anchors are decoded, and encoded again", () => {
    const route = parseRoute("#my%20docs/01-a%20b.md:el-x");
    expect(route).toEqual({
      view: "document",
      file: "my docs/01-a b.md",
      anchor: "el-x",
      element: "x",
    });
    expect(formatRoute(route)).toBe("#my%20docs/01-a%20b.md:el-x");
    expect(parseRoute("#100%-sure.md")).toMatchObject({ file: "100%-sure.md" });
  });

  test("historyHref", () => {
    expect(historyHref()).toBe("#history");
    expect(historyHref("abc", true)).toBe("#history:abc:message");
  });
});

describe("DocumentRoutes", () => {
  test("a flat workspace routes by file name, whatever the absolute path", () => {
    const routes = new DocumentRoutes([
      "/ws/docs/01-intro.arc42.md",
      "/ws/docs/05-blocks.arc42.md",
    ]);
    expect(routes.keyOf("/ws/docs/05-blocks.arc42.md")).toBe("05-blocks.arc42.md");
    expect(routes.elementHref("/ws/docs/05-blocks.arc42.md", "bb-cli")).toBe(
      "#05-blocks.arc42.md:el-bb-cli",
    );
    expect(routes.documentHref("/ws/docs/01-intro.arc42.md")).toBe("#01-intro.arc42.md");
    expect(routes.headingHref("/ws/docs/01-intro.arc42.md", "Quality Goals & more")).toBe(
      "#01-intro.arc42.md:quality-goals-more",
    );
    expect(routes.resolve("05-blocks.arc42.md")).toBe("/ws/docs/05-blocks.arc42.md");
  });

  test("a workspace with folders routes by the path relative to the workspace", () => {
    const routes = new DocumentRoutes([
      "0-scope/a0-brief.pdt42.md",
      "2-design/d5-transactions.pdt42.md",
      "2-design/d6-other.pdt42.md",
    ]);
    expect(routes.keyOf("2-design/d5-transactions.pdt42.md")).toBe(
      "2-design/d5-transactions.pdt42.md",
    );
    expect(routes.resolve("2-design/d5-transactions.pdt42.md")).toBe(
      "2-design/d5-transactions.pdt42.md",
    );
  });

  test("a link by file name alone finds the only document with that name", () => {
    const routes = new DocumentRoutes(["a/x.md", "b/y.md"]);
    expect(routes.resolve("y.md")).toBe("b/y.md");
    expect(routes.resolve("nope.md")).toBeUndefined();
  });

  test("an ambiguous file name resolves to nothing", () => {
    const routes = new DocumentRoutes(["a/x.md", "b/x.md"]);
    expect(routes.resolve("x.md")).toBeUndefined();
    expect(routes.resolve("a/x.md")).toBe("a/x.md");
  });

  test("a path of the workspace in another form gets the same key", () => {
    const routes = new DocumentRoutes(["/abs/ws/2-design/d5.md", "/abs/ws/1-x/e1.md"]);
    expect(routes.keyOf("ws/2-design/d5.md")).toBe("2-design/d5.md");
  });
});

describe("slug", () => {
  test.each([
    ["Quality Goals", "quality-goals"],
    ["5.1 Level 1: Whitebox", "5-1-level-1-whitebox"],
    ["Café & Bar", "cafe-bar"],
    ["  --Edge--  ", "edge"],
    ["Über uns", "uber-uns"],
  ])("%s → %s", (text, expected) => {
    expect(slug(text)).toBe(expected);
  });
});

describe("linkIds", () => {
  const ids = new Set(["bb-cli", "if-api", "risk-x"]);
  const link = (html: string, own?: string) =>
    linkIds(html, { ids, own, href: (id) => `#doc.md:el-${id}` });
  const a = (id: string, inner = id) =>
    `<a class="c42-id-link" href="#doc.md:el-${id}" data-id="${id}">${inner}</a>`;

  test("links known ids in text", () => {
    expect(link("<p>The bb-cli calls if-api.</p>")).toBe(
      `<p>The ${a("bb-cli")} calls ${a("if-api")}.</p>`,
    );
  });

  test("leaves unknown ids, partial tokens and the element's own id alone", () => {
    expect(link("<p>bb-other, bb-cli-v2, xbb-cli, bb-cli_2</p>")).toBe(
      "<p>bb-other, bb-cli-v2, xbb-cli, bb-cli_2</p>",
    );
    expect(link("<p>This bb-cli uses if-api</p>", "bb-cli")).toBe(
      `<p>This bb-cli uses ${a("if-api")}</p>`,
    );
  });

  test("never links inside links, code blocks and headings", () => {
    const html = '<h2>bb-cli</h2><p><a href="x">bb-cli</a></p><pre><code>bb-cli</code></pre>';
    expect(link(html)).toBe(html);
  });

  test("links inline code only when its whole text is an id", () => {
    expect(link("<p>Use <code>bb-cli</code> and <code>bb-cli --help</code></p>")).toBe(
      `<p>Use ${a("bb-cli", "<code>bb-cli</code>")} and <code>bb-cli --help</code></p>`,
    );
  });

  test("keeps diff markup well-formed", () => {
    const [marked = ""] = markHtmlChanges(
      ["<p>The bb-cli calls if-api.</p>"],
      ["<p>The bb-cli calls risk-x now.</p>"],
      { added: "added", removed: "removed" },
    );
    expect(marked).toContain("<ins");
    const linked = link(marked);
    expect(linked).toContain(a("bb-cli"));
    expect(linked).toContain(a("risk-x"));
    expect(linked.match(/<a /g)?.length).toBe(linked.match(/<\/a>/g)?.length);
  });

  test("keeps entities and comments", () => {
    expect(link("<p>a &amp; bb-cli <!-- bb-cli --></p>")).toBe(
      `<p>a &amp; ${a("bb-cli")} <!-- bb-cli --></p>`,
    );
  });

  test("skips ids without a link", () => {
    expect(linkIds("<p>bb-cli</p>", { ids, href: () => undefined })).toBe("<p>bb-cli</p>");
  });
});

describe("groupNodes", () => {
  type N =
    | { kind: "prose"; text: string; renderedHtml?: string }
    | { kind: "block"; id: string; fenced: boolean }
    | { kind: "heading"; text: string }
    | { kind: "ignore"; code: string };
  const isBlock = (node: N): node is Extract<N, { kind: "block" }> =>
    node.kind === "block" && node.fenced;

  test("merges prose lines and attaches the block that follows, with ignores between", () => {
    const nodes: N[] = [
      { kind: "heading", text: "H" },
      { kind: "prose", text: "a", renderedHtml: "<p>a</p>" },
      { kind: "prose", text: "b", renderedHtml: "<p>b</p>" },
      { kind: "ignore", code: "W001" },
      { kind: "block", id: "x", fenced: true },
      { kind: "block", id: "y", fenced: true },
      { kind: "block", id: "z", fenced: false },
      { kind: "prose", text: "c" },
    ];
    expect(groupNodes(nodes, { isBlock })).toEqual([
      { kind: "other", node: nodes[0] },
      {
        kind: "prose-run",
        text: "a\nb",
        renderedHtml: "<p>a</p><p>b</p>",
        block: nodes[4],
        ignores: [nodes[3]],
      },
      { kind: "prose-run", text: "", block: nodes[5], ignores: [] },
      { kind: "other", node: nodes[6] },
      { kind: "prose-run", text: "c", block: null, ignores: [] },
    ]);
  });

  test("keeps orphaned ignore directives as nodes of their own", () => {
    const nodes: N[] = [
      { kind: "ignore", code: "W001" },
      { kind: "heading", text: "H" },
    ];
    expect(groupNodes(nodes, { isBlock })).toEqual([
      { kind: "other", node: nodes[0] },
      { kind: "other", node: nodes[1] },
    ]);
  });
});

describe("history format", () => {
  test("pearls are chunked, and JSON Lines round-trip", () => {
    const pearls = toHistoryPearls(
      Array.from({ length: 21 }, (_, i) => ({
        commit: `c${i}`,
        parent: null,
        author: "a",
        date: "d",
        subject: "s",
      })),
    );
    expect(pearls[19]?.chunk).toBe(0);
    expect(pearls[20]?.chunk).toBe(1);
    expect(parseJsonLines(toJsonLines(pearls))).toEqual(pearls);
    expect(pearlKey({ commit: null })).toBe("worktree");
  });

  test("path lists are shared between trees", () => {
    const shared = sharePathLists([
      { commit: "a", files: {}, paths: ["x"] },
      { commit: "b", files: {}, paths: ["x"] },
    ]);
    expect(shared.get("b")?.paths).toEqual({ sameAs: "a" });
  });

  test("a snapshot is read from the history files and loaded once", async () => {
    const blob = "1".repeat(40);
    const source = {
      files: {
        "index.jsonl": toJsonLines(
          toHistoryPearls([{ commit: "c", parent: null, author: "a", date: "d", subject: "s" }]),
        ),
        "tree/c.json": JSON.stringify({ files: { "docs/b.md": blob, "docs/a.md": blob } }),
        [`blob/${blob}`]: "# Doc",
      },
    };
    expect((await readHistoryIndex(source))[0]?.commit).toBe("c");
    let loads = 0;
    const load = async (snapshot: { files: Array<{ path: string }>; paths: string[] }) => {
      loads++;
      return snapshot;
    };
    const snapshot = await loadSnapshot(source, "c", load);
    expect(snapshot.files.map((file) => file.path)).toEqual(["docs/a.md", "docs/b.md"]);
    expect(snapshot.paths).toEqual([]);
    await loadSnapshot(source, "c", load);
    expect(loads).toBe(1);
  });
});

describe("WorkspaceLinks", () => {
  test("links elements through the document that defines them", () => {
    const links = new WorkspaceLinks(
      ["/ws/05-blocks.md", "/ws/03-context.md"],
      [{ id: "bb-cli", loc: { file: "/ws/05-blocks.md" } }],
    );
    expect(links.has("bb-cli")).toBe(true);
    expect(links.elementHref("bb-cli")).toBe("#05-blocks.md:el-bb-cli");
    expect(links.elementHref("bb-none")).toBeUndefined();
    expect(links.documentHref("/ws/03-context.md")).toBe("#03-context.md");
    expect(linkIds("<p>bb-cli</p>", { ids: links, href: (id) => links.elementHref(id) })).toContain(
      'href="#05-blocks.md:el-bb-cli"',
    );
  });
});

describe("linkElementIds", () => {
  test("links a workspace's ids, never the element's own", () => {
    const links = new WorkspaceLinks(
      ["/ws/05.md"],
      [
        { id: "bb-a", loc: { file: "/ws/05.md" } },
        { id: "bb-b", loc: { file: "/ws/05.md" } },
      ],
    );
    const html = linkElementIds("<p>bb-a calls bb-b</p>", links, "bb-a");
    expect(html).toBe(
      '<p>bb-a calls <a class="c42-id-link" href="#05.md:el-bb-b" data-id="bb-b">bb-b</a></p>',
    );
  });
});
