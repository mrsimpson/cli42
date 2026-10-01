/**
 * MetaModelDiagram — generic SVG graph renderer for *42 meta-model diagrams.
 *
 * Renders a directed graph of element kinds (nodes) and their cross-references
 * (edges). Geometry is computed automatically from node positions; per-edge
 * overrides handle the cases where autoFaces() picks a bad attachment face or
 * parallel arrows need a bezier nudge.
 *
 * Language-specific data (NODE_POS, EDGE_OVERRIDES, nodes/edges) lives in each
 * language's own MetaModelView. This component owns only the SVG primitives.
 *
 * Usage:
 *   <MetaModelDiagram
 *     nodes={nodes}
 *     edges={edges}
 *     width={900}
 *     height={520}
 *     onNodeClick={(nodeId) => navigateToChapter(nodeId)}
 *   />
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type Face = "right" | "left" | "top" | "bottom";

export interface DiagramNode {
  /** Unique identifier (e.g. BlockType string) */
  id: string;
  /** Display label */
  label: string;
  /** Centre x pixel position */
  x: number;
  /** Centre y pixel position */
  y: number;
  /** CSS color value or CSS custom property reference */
  color: string;
  /** Accessible chapter/section number for aria-label */
  chapter?: number;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label: string;
  /** Override exit face on source node (default: auto from position) */
  fromFace?: Face;
  /** Override entry face on target node (default: auto from position) */
  toFace?: Face;
  /** Quadratic bezier control-point offset [dx,dy] from midpoint */
  cp?: [number, number];
  /** Use cubic S-curve bezier instead of quadratic */
  cubic?: true;
}

// ── Geometry ──────────────────────────────────────────────────────────────────

/** Node box dimensions — shared across all *42 diagrams. */
export const NODE_W = 128;
export const NODE_H = 28;
export const NODE_RX = 5;

function lx(cx: number) {
  return cx - NODE_W / 2;
}
function ty(cy: number) {
  return cy - NODE_H / 2;
}

/**
 * Auto-select attachment faces from relative node positions.
 * Prefers horizontal connections; falls back to vertical for same-column nodes.
 */
export function autoFaces([ax, ay]: [number, number], [bx, by]: [number, number]): [Face, Face] {
  const dx = bx - ax;
  const dy = by - ay;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? ["right", "left"] : ["left", "right"];
  }
  return dy >= 0 ? ["bottom", "top"] : ["top", "bottom"];
}

function attachPoint([cx, cy]: [number, number], face: Face): [number, number] {
  switch (face) {
    case "right":
      return [lx(cx) + NODE_W, cy];
    case "left":
      return [lx(cx), cy];
    case "top":
      return [cx, ty(cy)];
    case "bottom":
      return [cx, ty(cy) + NODE_H];
  }
}

/**
 * Resolved geometry for a bezier edge.
 * Computed once; consumed by both buildPath() and labelMidpoint().
 */
export interface EdgeGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  qx?: number;
  qy?: number; // quadratic control point
  cx1?: number;
  cy1?: number; // cubic control points
  cx2?: number;
  cy2?: number;
}

export function resolveGeometry(
  from: [number, number],
  to: [number, number],
  fromFace: Face,
  toFace: Face,
  cp?: [number, number],
  cubic?: true,
): EdgeGeometry {
  const [x1, y1] = attachPoint(from, fromFace);
  const [x2, y2] = attachPoint(to, toFace);
  if (!cp) return { x1, y1, x2, y2 };
  if (cubic) {
    return { x1, y1, x2, y2, cx1: x1 + cp[0], cy1: y1 + cp[1], cx2: x2 - cp[0], cy2: y2 - cp[1] };
  }
  return { x1, y1, x2, y2, qx: (x1 + x2) / 2 + cp[0], qy: (y1 + y2) / 2 + cp[1] };
}

export function buildPath(g: EdgeGeometry): string {
  if (g.cx1 !== undefined) {
    return `M ${g.x1} ${g.y1} C ${g.cx1} ${g.cy1} ${g.cx2} ${g.cy2} ${g.x2} ${g.y2}`;
  }
  if (g.qx !== undefined) {
    return `M ${g.x1} ${g.y1} Q ${g.qx} ${g.qy} ${g.x2} ${g.y2}`;
  }
  return `M ${g.x1} ${g.y1} L ${g.x2} ${g.y2}`;
}

export function labelMidpoint(g: EdgeGeometry): [number, number] {
  if (g.cx1 !== undefined) {
    // t=0.5 on cubic bezier: (1/8)P0 + (3/8)P1 + (3/8)P2 + (1/8)P3
    return [
      0.125 * g.x1 + 0.375 * g.cx1! + 0.375 * g.cx2! + 0.125 * g.x2,
      0.125 * g.y1 + 0.375 * g.cy1! + 0.375 * g.cy2! + 0.125 * g.y2,
    ];
  }
  if (g.qx !== undefined) {
    // t=0.5 on quadratic bezier: (1/4)P0 + (1/2)P1 + (1/4)P2
    return [0.25 * g.x1 + 0.5 * g.qx + 0.25 * g.x2, 0.25 * g.y1 + 0.5 * g.qy! + 0.25 * g.y2];
  }
  return [(g.x1 + g.x2) / 2, (g.y1 + g.y2) / 2];
}

// ── Rendered edge ─────────────────────────────────────────────────────────────

interface RenderedEdge {
  path: string;
  label: string;
  labelX: number;
  labelY: number;
}

function renderEdge(edge: DiagramEdge, nodeMap: Map<string, DiagramNode>): RenderedEdge | null {
  const fromNode = nodeMap.get(edge.from);
  const toNode = nodeMap.get(edge.to);
  if (!fromNode || !toNode) return null;

  const fromPos: [number, number] = [fromNode.x, fromNode.y];
  const toPos: [number, number] = [toNode.x, toNode.y];

  const [autoFrom, autoTo] = autoFaces(fromPos, toPos);
  const fromFace = edge.fromFace ?? autoFrom;
  const toFace = edge.toFace ?? autoTo;

  const geo = resolveGeometry(fromPos, toPos, fromFace, toFace, edge.cp, edge.cubic);
  const [lmx, lmy] = labelMidpoint(geo);

  return { path: buildPath(geo), label: edge.label, labelX: lmx, labelY: lmy - 3 };
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface MetaModelDiagramProps {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** SVG viewBox width */
  width: number;
  /** SVG viewBox height */
  height: number;
  /** Called when a node is clicked. Receives the node id. */
  onNodeClick?: (nodeId: string) => void;
  /** Accessible description of the diagram */
  ariaLabel?: string;
}

export function MetaModelDiagram({
  nodes,
  edges,
  width,
  height,
  onNodeClick,
  ariaLabel,
}: MetaModelDiagramProps) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const renderedEdges = edges
    .map((e) => ({ edge: e, rendered: renderEdge(e, nodeMap) }))
    .filter((e): e is { edge: DiagramEdge; rendered: RenderedEdge } => e.rendered !== null);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ display: "block", minWidth: "600px" }}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <marker id="mm-arr" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto">
          <path d="M0,0.5 L0,5.5 L7,3 z" fill="var(--text-muted)" />
        </marker>
      </defs>

      {/* Edges — drawn first so nodes appear on top */}
      {renderedEdges.map(({ rendered: e }, i) => (
        <g key={i}>
          <path
            d={e.path}
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth={1.2}
            markerEnd="url(#mm-arr)"
            opacity={0.5}
          />
          <text
            x={e.labelX}
            y={e.labelY}
            textAnchor="middle"
            fontSize={7.5}
            fill="var(--text-muted)"
            fontFamily="var(--font-mono)"
            opacity={0.85}
          >
            {e.label}
          </text>
        </g>
      ))}

      {/* Nodes */}
      {nodes.map((node) => {
        const { id, x: cx, y: cy, label, color, chapter } = node;
        const clickable = !!onNodeClick;
        return (
          <g
            key={id}
            onClick={clickable ? () => onNodeClick!(id) : undefined}
            style={clickable ? { cursor: "pointer" } : undefined}
            role={clickable ? "button" : undefined}
            aria-label={
              clickable
                ? chapter !== undefined
                  ? `Go to chapter ${chapter}: ${label}`
                  : `Go to ${label}`
                : undefined
            }
          >
            <rect
              x={lx(cx)}
              y={ty(cy)}
              width={NODE_W}
              height={NODE_H}
              rx={NODE_RX}
              fill={color}
              fillOpacity={0.12}
              stroke={color}
              strokeWidth={1.5}
            />
            {/* Wider invisible hit area for easier clicking */}
            {clickable && (
              <rect
                x={lx(cx) - 4}
                y={ty(cy) - 4}
                width={NODE_W + 8}
                height={NODE_H + 8}
                rx={NODE_RX + 2}
                fill="transparent"
              />
            )}
            <text
              x={cx}
              y={cy + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10.5}
              fontWeight={600}
              fontFamily="var(--font-sans)"
              fill={color}
              style={clickable ? { pointerEvents: "none" } : undefined}
            >
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
