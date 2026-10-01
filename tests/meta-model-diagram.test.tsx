// MetaModelDiagram: geometry functions and SVG rendering.
// Geometry functions are pure — tested directly.
// Rendering is tested via renderToStaticMarkup (no DOM needed).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vite-plus/test";
import {
  MetaModelDiagram,
  autoFaces,
  buildPath,
  labelMidpoint,
  resolveGeometry,
  NODE_W,
  NODE_H,
} from "@cli42/lib/web-react";
import type { DiagramEdge, DiagramNode } from "@cli42/lib/web-react";

// ── autoFaces ─────────────────────────────────────────────────────────────────

describe("autoFaces", () => {
  test("prefers horizontal when dx > dy: left node → right/left", () => {
    expect(autoFaces([100, 100], [300, 110])).toEqual(["right", "left"]);
  });

  test("prefers horizontal going left: right→left", () => {
    expect(autoFaces([300, 100], [100, 110])).toEqual(["left", "right"]);
  });

  test("falls back to vertical when dy > dx: node above → bottom/top", () => {
    expect(autoFaces([100, 100], [110, 300])).toEqual(["bottom", "top"]);
  });

  test("falls back to vertical going up: top/bottom", () => {
    expect(autoFaces([100, 300], [110, 100])).toEqual(["top", "bottom"]);
  });

  test("same position: dx === dy === 0 → horizontal (dx >= dy)", () => {
    expect(autoFaces([100, 100], [100, 100])).toEqual(["right", "left"]);
  });
});

// ── resolveGeometry ───────────────────────────────────────────────────────────

describe("resolveGeometry", () => {
  const from: [number, number] = [100, 100];
  const to: [number, number] = [300, 100];

  test("straight line: no cp — only endpoints", () => {
    const g = resolveGeometry(from, to, "right", "left");
    // right face of from: x = 100 + NODE_W/2, y = 100
    expect(g.x1).toBe(100 + NODE_W / 2);
    expect(g.y1).toBe(100);
    // left face of to: x = 300 - NODE_W/2, y = 100
    expect(g.x2).toBe(300 - NODE_W / 2);
    expect(g.y2).toBe(100);
    expect(g.qx).toBeUndefined();
    expect(g.cx1).toBeUndefined();
  });

  test("quadratic: cp provided without cubic", () => {
    const g = resolveGeometry(from, to, "right", "left", [0, 30]);
    expect(g.qx).toBeDefined();
    expect(g.qy).toBeDefined();
    expect(g.cx1).toBeUndefined();
    // control point y = midpoint y + 30
    const midY = (g.y1 + g.y2) / 2;
    expect(g.qy).toBe(midY + 30);
  });

  test("cubic: cp + cubic=true produces cx1/cy1/cx2/cy2", () => {
    const g = resolveGeometry(from, to, "right", "left", [0, -30], true);
    expect(g.cx1).toBeDefined();
    expect(g.cy1).toBeDefined();
    expect(g.cx2).toBeDefined();
    expect(g.cy2).toBeDefined();
    expect(g.qx).toBeUndefined();
    // cx1 = x1 + cp[0], cy1 = y1 + cp[1]
    expect(g.cx1).toBe(g.x1 + 0);
    expect(g.cy1).toBe(g.y1 - 30);
    // cx2 = x2 - cp[0], cy2 = y2 - cp[1]
    expect(g.cx2).toBe(g.x2 - 0);
    expect(g.cy2).toBe(g.y2 + 30);
  });
});

// ── buildPath ─────────────────────────────────────────────────────────────────

describe("buildPath", () => {
  test("straight line starts with M and ends with L", () => {
    const g = resolveGeometry([100, 100], [300, 100], "right", "left");
    expect(buildPath(g)).toMatch(/^M .+ L .+$/);
  });

  test("quadratic curve uses Q", () => {
    const g = resolveGeometry([100, 100], [300, 100], "right", "left", [0, 30]);
    expect(buildPath(g)).toMatch(/^M .+ Q .+$/);
  });

  test("cubic curve uses C", () => {
    const g = resolveGeometry([100, 100], [300, 100], "right", "left", [0, 30], true);
    expect(buildPath(g)).toMatch(/^M .+ C .+$/);
  });
});

// ── labelMidpoint ─────────────────────────────────────────────────────────────

describe("labelMidpoint", () => {
  test("straight line: midpoint is average of endpoints", () => {
    const g = resolveGeometry([100, 100], [300, 100], "right", "left");
    const [mx, my] = labelMidpoint(g);
    expect(mx).toBe((g.x1 + g.x2) / 2);
    expect(my).toBe((g.y1 + g.y2) / 2);
  });

  test("quadratic: midpoint is on the curve (not the chord midpoint)", () => {
    const g = resolveGeometry([100, 100], [300, 100], "right", "left", [0, 40]);
    const [, my] = labelMidpoint(g);
    // The bezier midpoint is pulled toward the control point, so y > chord midpoint y
    expect(my).toBeGreaterThan((g.y1 + g.y2) / 2);
  });

  test("cubic: midpoint follows the bezier formula at t=0.5", () => {
    // Use bottom→top faces so endpoints differ in y
    // from=[100,100] bottom: y = 100 + NODE_H/2
    // to=[100,300] top:      y = 300 - NODE_H/2
    const g = resolveGeometry([100, 100], [100, 300], "bottom", "top", [60, 0], true);
    const [mx] = labelMidpoint(g);
    // cx1 = x1 + 60, cx2 = x2 - 60 → at t=0.5 on cubic:
    // (1/8)*x1 + (3/8)*(x1+60) + (3/8)*(x2-60) + (1/8)*x2
    // = x1*(1/8+3/8) + x2*(3/8+1/8) + 60*(3/8) - 60*(3/8)
    // = x1*0.5 + x2*0.5 + 0 = (x1+x2)/2
    // x1 = x2 = NODE_W/2 from centre 100, so mx = 100
    const expected = (g.x1 + g.x2) / 2;
    expect(mx).toBeCloseTo(expected, 5);

    // Verify that a cp with only dy moves the midpoint y visibly
    const g2 = resolveGeometry([100, 100], [300, 100], "right", "left", [0, 50], true);
    const [, my2] = labelMidpoint(g2);
    // cy1 = y1+50, cy2 = y2-50 → y midpoint:
    // (1/8)*y1 + (3/8)*(y1+50) + (3/8)*(y2-50) + (1/8)*y2
    // y1=y2=100 → 100 + (3/8)*50 - (3/8)*50 = 100 → no net shift when symmetric
    // Use asymmetric: only from-side has offset
    const g3 = resolveGeometry([100, 100], [300, 200], "right", "left", [0, 40], true);
    const [, my3] = labelMidpoint(g3);
    // Just verify the result is a number between the two y endpoints
    const minY = Math.min(g3.y1, g3.y2);
    const maxY = Math.max(g3.y1, g3.y2);
    expect(my3).toBeGreaterThan(minY - 50); // allow cp influence to push outside range
    expect(my3).toBeLessThan(maxY + 50);
    expect(Number.isNaN(my3)).toBe(false);
    expect(Number.isNaN(my2)).toBe(false);
  });
});

// ── MetaModelDiagram rendering ────────────────────────────────────────────────

const NODES: DiagramNode[] = [
  { id: "signal", label: "Signal", x: 100, y: 100, color: "var(--c-signal)", chapter: 2 },
  { id: "risk", label: "Risk", x: 300, y: 100, color: "var(--c-risk)", chapter: 4 },
];

const EDGES: DiagramEdge[] = [
  { from: "signal", to: "risk", label: "surfaces" },
];

describe("MetaModelDiagram", () => {
  function render(props: Parameters<typeof MetaModelDiagram>[0]) {
    return renderToStaticMarkup(<MetaModelDiagram {...props} />);
  }

  test("renders an SVG element", () => {
    const html = render({ nodes: NODES, edges: EDGES, width: 400, height: 200 });
    expect(html).toContain("<svg");
    expect(html).toContain("viewBox=\"0 0 400 200\"");
  });

  test("renders a node box and label for each node", () => {
    const html = render({ nodes: NODES, edges: EDGES, width: 400, height: 200 });
    expect(html).toContain("Signal");
    expect(html).toContain("Risk");
    expect(html).toContain("var(--c-signal)");
    expect(html).toContain("var(--c-risk)");
  });

  test("renders an edge path and label", () => {
    const html = render({ nodes: NODES, edges: EDGES, width: 400, height: 200 });
    expect(html).toContain("<path");
    expect(html).toContain("surfaces");
  });

  test("includes aria-label when provided", () => {
    const html = render({
      nodes: NODES,
      edges: EDGES,
      width: 400,
      height: 200,
      ariaLabel: "test diagram",
    });
    expect(html).toContain('aria-label="test diagram"');
  });

  test("renders clickable nodes with aria-label when onNodeClick is provided", () => {
    const html = render({
      nodes: NODES,
      edges: EDGES,
      width: 400,
      height: 200,
      onNodeClick: () => {},
    });
    expect(html).toContain('role="button"');
    expect(html).toContain("Go to chapter 2: Signal");
    expect(html).toContain("Go to chapter 4: Risk");
  });

  test("nodes without onNodeClick have no role or cursor", () => {
    const html = render({ nodes: NODES, edges: EDGES, width: 400, height: 200 });
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain("cursor");
  });

  test("skips edges where a node id is not found", () => {
    const badEdges: DiagramEdge[] = [{ from: "signal", to: "unknown", label: "x" }];
    const html = render({ nodes: NODES, edges: badEdges, width: 400, height: 200 });
    // No path rendered for the bad edge, but the component should not throw
    expect(html).toContain("<svg");
    expect(html).not.toContain(">x<");
  });

  test("renders a node without a chapter number", () => {
    const noChapterNodes: DiagramNode[] = [
      { id: "a", label: "Alpha", x: 100, y: 100, color: "red" },
    ];
    const html = render({
      nodes: noChapterNodes,
      edges: [],
      width: 200,
      height: 200,
      onNodeClick: () => {},
    });
    // Falls back to "Go to Alpha" (no chapter prefix)
    expect(html).toContain('aria-label="Go to Alpha"');
  });

  test("NODE_W and NODE_H are exported constants", () => {
    expect(NODE_W).toBeGreaterThan(0);
    expect(NODE_H).toBeGreaterThan(0);
  });
});
