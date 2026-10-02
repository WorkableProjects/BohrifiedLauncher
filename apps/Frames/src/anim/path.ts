import type { PathNode } from '../model/types';

export interface PathSample { x: number; y: number; angle: number }

interface Seg { x0: number; y0: number; c1x: number; c1y: number; c2x: number; c2y: number; x1: number; y1: number; len: number }
interface Compiled { segs: Seg[]; total: number }

const cache = new WeakMap<readonly PathNode[], Compiled>();

const bez = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
};
const dbez = (a: number, b: number, c: number, d: number, t: number) => {
  const u = 1 - t;
  return 3 * u * u * (b - a) + 6 * u * t * (c - b) + 3 * t * t * (d - c);
};

function compile(nodes: readonly PathNode[]): Compiled {
  let hit = cache.get(nodes);
  if (hit) return hit;
  const segs: Seg[] = [];
  let total = 0;
  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = nodes[i]!, b = nodes[i + 1]!;
    const s: Seg = {
      x0: a.x, y0: a.y,
      c1x: a.x + (a.ox ?? 0), c1y: a.y + (a.oy ?? 0),
      c2x: b.x + (b.ix ?? 0), c2y: b.y + (b.iy ?? 0),
      x1: b.x, y1: b.y, len: 0,
    };
    let px = s.x0, py = s.y0, len = 0;
    for (let k = 1; k <= 24; k++) {
      const t = k / 24;
      const x = bez(s.x0, s.c1x, s.c2x, s.x1, t), y = bez(s.y0, s.c1y, s.c2y, s.y1, t);
      len += Math.hypot(x - px, y - py);
      px = x;
      py = y;
    }
    s.len = len;
    total += len;
    segs.push(s);
  }
  hit = { segs, total };
  cache.set(nodes, hit);
  return hit;
}

export function pathLength(nodes: readonly PathNode[]): number {
  return compile(nodes).total;
}

/** Point and heading at fraction `u` (0…1) of the path's length. */
export function samplePath(nodes: readonly PathNode[] | undefined, u: number): PathSample {
  if (!nodes || nodes.length === 0) return { x: 0, y: 0, angle: 0 };
  if (nodes.length === 1) return { x: nodes[0]!.x, y: nodes[0]!.y, angle: 0 };
  const { segs, total } = compile(nodes);
  let d = Math.min(1, Math.max(0, u)) * total;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    if (d <= s.len || i === segs.length - 1) {
      const t = s.len ? Math.min(1, Math.max(0, d / s.len)) : 0;
      const x = bez(s.x0, s.c1x, s.c2x, s.x1, t), y = bez(s.y0, s.c1y, s.c2y, s.y1, t);
      const dx = dbez(s.x0, s.c1x, s.c2x, s.x1, t), dy = dbez(s.y0, s.c1y, s.c2y, s.y1, t);
      return { x, y, angle: Math.atan2(dy, dx) };
    }
    d -= s.len;
  }
  return { x: 0, y: 0, angle: 0 };
}

/** SVG path data for drawing the path in an overlay. */
export function pathToSvg(nodes: readonly PathNode[], dx = 0, dy = 0): string {
  if (!nodes.length) return '';
  let d = `M${nodes[0]!.x + dx} ${nodes[0]!.y + dy}`;
  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = nodes[i]!, b = nodes[i + 1]!;
    d += `C${a.x + (a.ox ?? 0) + dx} ${a.y + (a.oy ?? 0) + dy} ${b.x + (b.ix ?? 0) + dx} ${b.y + (b.iy ?? 0) + dy} ${b.x + dx} ${b.y + dy}`;
  }
  return d;
}

/** Give every node smooth handles (Catmull-Rom style): used when the user draws a path with a few clicks. */
export function smoothNodes(nodes: PathNode[]): PathNode[] {
  return nodes.map((n, i) => {
    const prev = nodes[i - 1], next = nodes[i + 1];
    if (!prev && next) return { x: n.x, y: n.y, ox: (next.x - n.x) / 3, oy: (next.y - n.y) / 3 };
    if (prev && !next) return { x: n.x, y: n.y, ix: (prev.x - n.x) / 3, iy: (prev.y - n.y) / 3 };
    if (!prev || !next) return { x: n.x, y: n.y };
    const tx = (next.x - prev.x) / 6, ty = (next.y - prev.y) / 6;
    return { x: n.x, y: n.y, ix: -tx, iy: -ty, ox: tx, oy: ty };
  });
}
