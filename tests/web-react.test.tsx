// @cli42/lib/web-react rendered on the server (no DOM): the language's words
// and node rendering reach the shared views, and the views show a change.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vite-plus/test";
import {
  ChangeGroup,
  ChangesView,
  HistoryChain,
  HistoryEntryView,
  WebViewProvider,
  cx,
  scope,
} from "@cli42/lib/web-react";
import type { ChangePayload, RenderNodesProps, WebView } from "@cli42/lib/web-react";
import type { SectionContent } from "@cli42/lib/diff";

const rendered: RenderNodesProps[] = [];

const VIEW: WebView = {
  labels: { model: "business model" },
  isBlock: (node) => node.kind === "block",
  renderNodes: (props) => {
    rendered.push(props);
    return (
      <div data-testid="nodes">{props.proseHtml?.join("|") ?? `${props.nodes.length} nodes`}</div>
    );
  },
};

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(<WebViewProvider value={VIEW}>{element}</WebViewProvider>);
}

const section = { file: "02-risks.md", headingPath: ["Risks", "Lock-in"], occurrence: 1 };
const content = (text: string): SectionContent => ({
  nodes: [
    { kind: "heading", level: 2, text: "Lock-in", line: 3 },
    { kind: "prose", text, line: 4 },
    { kind: "block", attributes: { id: "risk-x" }, startLine: 5 },
  ],
  elements: [{ id: "risk-x", kind: "risk", loc: { file: "02-risks.md", line: 5 } }],
  edges: [],
});

const DIFF: ChangePayload = {
  base: { label: "0123456789abcdef0123456789abcdef01234567" },
  head: { label: "working tree" },
  findings: [
    {
      kind: "block-without-prose-change",
      message: "Block 'risk-x' changed",
      file: "/ws/02-risks.md",
      line: 5,
      elementId: "risk-x",
    },
  ],
  view: {
    edges: [],
    documents: [
      {
        file: "02-risks.md",
        title: "Risks",
        added: 0,
        modified: 1,
        removed: 0,
        outline: [
          {
            section,
            level: 2,
            title: "Lock-in",
            status: "modified",
            empty: false,
            head: { startLine: 3, endLine: 6 },
          },
        ],
        segments: [
          {
            status: "modified",
            section,
            base: content("Old words here."),
            head: content("New words here."),
            elements: [
              {
                id: "risk-x",
                kind: "risk",
                status: "modified",
                attributes: [{ name: "severity", before: "low", after: "high" }],
                proseChanged: true,
                section,
                head: { file: "02-risks.md", line: 5 },
              },
            ],
            diagrams: [],
          },
        ],
      },
    ],
  },
};

const link = (id: string) => ({ href: `#02-risks.md:el-${id}` });

describe("ChangesView", () => {
  test("names the model with the language's words when nothing changed", () => {
    const html = render(
      <ChangesView
        diff={{ ...DIFF, findings: [], view: { edges: [], documents: [] } }}
        error={null}
        viewMode="human"
        elementLink={link}
        documentLink={(file) => ({ href: `#${file}` })}
      />,
    );
    expect(html).toContain("No business model changes.");
  });

  test("shows warnings, the index, and the chapters with changed words marked", () => {
    rendered.length = 0;
    const html = render(
      <ChangesView
        diff={DIFF}
        error={null}
        viewMode="human"
        elementLink={link}
        documentLink={(file) => ({ href: `#${file}` })}
        withChapters
      />,
    );
    expect(html).toContain('data-testid="diff-warnings"');
    expect(html).toContain('href="#02-risks.md:el-risk-x"');
    expect(html).toContain("<code>01234567</code>");
    expect(html).toContain('data-testid="diff-index-item"');
    expect(html).toContain('data-testid="attribute-change"');
    const marked = rendered.find((props) => props.proseHtml);
    expect(marked?.proseHtml?.[0]).toMatch(/<del class="c42-changes-proseRemoved">Old<\/del>/);
    expect(marked?.proseHtml?.[0]).toMatch(/<ins class="c42-changes-proseAdded">New<\/ins>/);
    expect(marked?.content?.elements[0]?.id).toBe("risk-x");
  });

  test("a language adds its own groups and chooses the warnings", () => {
    const html = render(
      <ChangesView
        diff={DIFF}
        error={null}
        viewMode="human"
        elementLink={link}
        documentLink={(file) => ({ href: `#${file}` })}
        extensions={{
          warnings: () => [],
          attention: () => (
            <ChangeGroup title="Code changed, model untouched" testId="diff-untouched">
              <p>bb-cli</p>
            </ChangeGroup>
          ),
        }}
      />,
    );
    expect(html).not.toContain('data-testid="diff-warnings"');
    expect(html).toContain(
      'aria-label="Code changed, model untouched" data-testid="diff-untouched"',
    );
  });
});

describe("history", () => {
  const pearls = [
    {
      commit: "b".repeat(40),
      parent: "a".repeat(40),
      author: "Ann",
      date: "2026-09-02T10:00:00Z",
      subject: "Newer",
      chunk: 0,
    },
    {
      commit: "a".repeat(40),
      parent: null,
      author: "Ann",
      date: "2026-09-01T10:00:00Z",
      subject: "Older",
      chunk: 0,
    },
  ];

  test("HistoryChain lists the pearls newest first, labelled with the model", () => {
    const html = render(
      <HistoryChain
        state={{ status: "ready", pearls }}
        entries={new Map()}
        chunkErrors={new Map()}
        requestChunk={() => {}}
        selectedKey={null}
        onSelect={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Business model history"');
    expect(html.indexOf("Newer")).toBeLessThan(html.indexOf("Older"));
  });

  test("HistoryEntryView shows the commit and the change", () => {
    const html = render(
      <HistoryEntryView
        pearl={pearls[0]}
        entry={{
          commit: pearls[0]!.commit,
          messageHtml: "<p>Why</p>",
          semantic: true,
          added: 0,
          modified: 1,
          removed: 0,
          diff: DIFF,
        }}
        chunkError={undefined}
        requestChunk={() => {}}
        viewMode="human"
        elementHref={(id) => `#x.md:el-${id}`}
        messageOpen
        onToggleMessage={() => {}}
        onBrowse={() => {}}
      />,
    );
    expect(html).toContain("Newer");
    expect(html).toContain('data-testid="commit-message"');
    expect(html).toContain('data-testid="chapter-diff"');
  });
});

describe("class names", () => {
  test("are scoped per component", () => {
    expect(scope("mermaid").panning).toBe("c42-mermaid-panning");
    expect(cx("a", false, null, "b")).toBe("a b");
  });
});
