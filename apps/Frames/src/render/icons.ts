/**
 * Hand-authored stroke icons in a 24×24 box (Lucide/Feather style: round caps and joins,
 * ~1.75 stroke). Each icon is a list of SVG path strings so it can be drawn on a canvas
 * (`drawIcon`) or emitted as <path> elements by the UI (`iconPaths`).
 */

// ── Path helpers ─────────────────────────────────────────────────────────────

const n = (v: number): string => String(Math.round(v * 100) / 100);

/** Circle as two arcs. */
const c = (cx: number, cy: number, r: number): string =>
  `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0`;

/** Rectangle with optional corner radius. */
function rr(x: number, y: number, w: number, h: number, r = 0): string {
  if (r <= 0) return `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}z`;
  const iw = n(w - 2 * r), ih = n(h - 2 * r), q = n(r), nq = n(-r);
  return `M${n(x + r)} ${n(y)}h${iw}a${q} ${q} 0 0 1 ${q} ${q}v${ih}a${q} ${q} 0 0 1 ${nq} ${q}h${n(-(w - 2 * r))}a${q} ${q} 0 0 1 ${nq} ${nq}v${n(-(h - 2 * r))}a${q} ${q} 0 0 1 ${q} ${nq}z`;
}

function poly(pts: [number, number][]): string {
  return 'M' + pts.map(([x, y]) => `${n(x)} ${n(y)}`).join('L') + 'z';
}

function star(cx: number, cy: number, ro: number, ri: number, points: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? ri : ro;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return poly(pts);
}

/** Trapezoid-toothed cog outline. */
function gear(cx: number, cy: number, teeth: number, ro: number, ri: number): string {
  const pitch = (Math.PI * 2) / teeth;
  const pts: [number, number][] = [];
  for (let k = 0; k < teeth; k++) {
    const a = k * pitch - Math.PI / 2;
    for (const [d, r] of [[-0.3, ri], [-0.17, ro], [0.17, ro], [0.3, ri]] as const) {
      pts.push([cx + Math.cos(a + d * pitch) * r, cy + Math.sin(a + d * pitch) * r]);
    }
  }
  return poly(pts);
}

// ── UI icons ─────────────────────────────────────────────────────────────────

const UI: Record<string, string[]> = {
  cursor: ['M5 3.5l13 6-5.6 1.8-1.9 5.7z'],
  undo: ['M9 14L4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  redo: ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  type: ['M5 7V4h14v3M12 4v16M9 20h6'],
  image: [rr(3, 4, 18, 16, 2), c(8.5, 9.5, 1.5), 'M21 16l-5-5L5 20'],
  shapes: ['M8 3.5L12.5 11h-9z', c(17.5, 7, 3.5), rr(4, 14, 7, 7, 1.5), 'M14 14h7v7h-7z'],
  line: ['M6.5 17.5L17.5 6.5', c(5, 19, 2), c(19, 5, 2)],
  film: [rr(3, 4, 18, 16, 2), 'M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4'],
  table: [rr(3, 4, 18, 16, 2), 'M3 9.5h18M3 14.5h18M9.5 9.5V20'],
  chart: ['M5 20V11M12 20V4M19 20v-6'],
  arrange: [rr(3, 3, 8, 8, 1.5), rr(13, 3, 8, 5, 1.5), rr(13, 10, 8, 11, 1.5), rr(3, 13, 8, 8, 1.5)],
  sparkles: [
    'M9.9 15.5A2 2 0 0 0 8.5 14.1l-6.1-1.6a.5.5 0 0 1 0-1L8.5 9.9A2 2 0 0 0 9.9 8.5l1.6-6.1a.5.5 0 0 1 1 0l1.6 6.1a2 2 0 0 0 1.4 1.4l6.1 1.6a.5.5 0 0 1 0 1l-6.1 1.6a2 2 0 0 0-1.4 1.4l-1.6 6.1a.5.5 0 0 1-1 0z',
    'M20 3v4M22 5h-4M4 17v2M5 18H3',
  ],
  play: ['M7 4l13 8-13 8z'],
  pause: ['M8 5v14M16 5v14'],
  present: [rr(2, 3, 20, 14, 2), 'M12 17v4M8 21h8', 'M10 7l4.5 3-4.5 3z'],
  download: ['M12 4v12M7 11l5 5 5-5M4 20h16'],
  upload: ['M12 16V4M7 9l5-5 5 5M4 20h16'],
  trash: ['M4 7h16M10 11v6M14 11v6M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4h6v3'],
  copy: [rr(9, 9, 12, 12, 2), 'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'],
  paste: ['M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2', rr(8, 2, 8, 4, 1)],
  lock: [rr(5, 11, 14, 10, 2), 'M8 11V7a4 4 0 0 1 8 0v4', 'M12 15.5v1.5'],
  unlock: [rr(5, 11, 14, 10, 2), 'M8 11V7a4 4 0 0 1 7.5-2', 'M12 15.5v1.5'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', c(12, 12, 3)],
  'eye-off': ['M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M3 3l18 18'],
  'align-left': ['M4 6h16M4 10h10M4 14h16M4 18h10'],
  'align-center': ['M4 6h16M7 10h10M4 14h16M7 18h10'],
  'align-right': ['M4 6h16M10 10h10M4 14h16M10 18h10'],
  'align-justify': ['M4 6h16M4 10h16M4 14h16M4 18h16'],
  'align-top': ['M4 3h16', rr(6, 6, 4, 14, 1), rr(14, 6, 4, 9, 1)],
  'align-middle': ['M3 12h18', rr(6, 5, 4, 14, 1), rr(14, 8, 4, 8, 1)],
  'align-bottom': ['M4 21h16', rr(6, 5, 4, 14, 1), rr(14, 10, 4, 9, 1)],
  'distribute-h': ['M4 3v18M20 3v18', rr(9, 7, 6, 10, 1)],
  'distribute-v': ['M3 4h18M3 20h18', rr(7, 9, 10, 6, 1)],
  group: ['M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3', rr(8, 8, 8, 8, 1)],
  ungroup: ['M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3', rr(6, 6, 5, 5, 1), rr(13, 13, 5, 5, 1)],
  'bring-front': [rr(10, 10, 11, 11, 2), 'M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1', 'M15.5 18v-5M13 15.5l2.5-2.5 2.5 2.5'],
  'bring-forward': [rr(10, 10, 11, 11, 2), 'M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1', 'M13 17l2.5-2.5L18 17'],
  'send-backward': [rr(10, 10, 11, 11, 2), 'M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1', 'M13 14l2.5 2.5L18 14'],
  'send-back': [rr(10, 10, 11, 11, 2), 'M6 14H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1', 'M15.5 13v5M13 15.5l2.5 2.5 2.5-2.5'],
  'chevron-left': ['M15 6l-6 6 6 6'],
  'chevron-right': ['M9 6l6 6-6 6'],
  'chevron-up': ['M6 15l6-6 6 6'],
  'chevron-down': ['M6 9l6 6 6-6'],
  x: ['M6 6l12 12M18 6L6 18'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  settings: [gear(12, 12, 8, 10, 7.6), c(12, 12, 3)],
  grid: [rr(3, 3, 18, 18, 2), 'M3 9h18M3 15h18M9 3v18M15 3v18'],
  ruler: [rr(2, 8, 20, 8, 1), 'M6 8v4M10 8v3M14 8v4M18 8v3'],
  'zoom-in': [c(11, 11, 7), 'M21 21l-5-5M11 8v6M8 11h6'],
  'zoom-out': [c(11, 11, 7), 'M21 21l-5-5M8 11h6'],
  fit: ['M9 4v5H4M15 4v5h5M20 15h-5v5M4 15h5v5'],
  bold: ['M7 4h6a4 4 0 0 1 0 8H7zM7 12h7.5a4 4 0 0 1 0 8H7z'],
  italic: ['M19 4h-9M14 20H5M15 4L9 20'],
  underline: ['M6 4v7a6 6 0 0 0 12 0V4M4 20h16'],
  strikethrough: ['M16 4H9a3 3 0 0 0-2.8 4M14 12a4 4 0 0 1 0 8H6M4 12h16'],
  superscript: ['M3 19l8-8M11 19L3 11', 'M15 9c0-1.7.9-2.5 2.5-2.5S20 7.3 20 8.6c0 1.8-2.3 2.6-5 5.4h5.2'],
  subscript: ['M3 5l8 8M11 5l-8 8', 'M15 15c0-1.7.9-2.5 2.5-2.5S20 13.3 20 14.6c0 1.8-2.3 2.6-5 5.4h5.2'],
  list: ['M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01'],
  'list-ordered': ['M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 18H4c0-1 2-2 2-3s-1-1.5-2-1'],
  link: ['M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'],
  highlighter: ['M9 11l-6 6v3h9l3-3', 'M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4'],
  droplet: ['M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z'],
  crop: ['M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14'],
  mask: [rr(3, 3, 18, 18, 2), c(12, 12, 5)],
  corner: ['M4 20v-8a8 8 0 0 1 8-8h8'],
  folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  file: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5'],
  layers: ['M12 3l9 5-9 5-9-5z', 'M3 12.5l9 5 9-5M3 17l9 5 9-5'],
  slides: [rr(2, 7, 16, 12, 2), 'M6 3h14a2 2 0 0 1 2 2v11'],
  timeline: [rr(3, 5, 10, 3, 1.5), rr(8, 10.5, 13, 3, 1.5), rr(5, 16, 9, 3, 1.5)],
  keyframe: ['M12 3l9 9-9 9-9-9z'],
  'skip-back': ['M19 20L9 12l10-8z', 'M5 19V5'],
  'skip-forward': ['M5 4l10 8-10 8z', 'M19 5v14'],
  timer: [c(12, 13, 8), 'M12 9v4l2 2M9 2h6'],
  notes: ['M5 3h14a2 2 0 0 1 2 2v10l-6 6H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z', 'M15 21v-4a2 2 0 0 1 2-2h4', 'M7 8h10M7 12h5'],
  monitor: [rr(2, 3, 20, 14, 2), 'M12 17v4M8 21h8'],
  fullscreen: ['M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5'],
  blank: [rr(3, 5, 18, 14, 2)],
  camera: ['M14 4a2 2 0 0 1 1.76 1.05l.49.9A2 2 0 0 0 18 7h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2a2 2 0 0 0 1.76-1.05l.49-.9A2 2 0 0 1 10 4z', c(12, 13, 3)],
  'mouse-pointer': ['M4 3l7 17 2.5-7.5L21 10z', 'M13.5 13.5L19 19'],
  hand: [
    'M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2',
    'M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2',
    'M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8',
    'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15',
  ],
  move: ['M12 2v20M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M5 9l-3 3 3 3M9 5l3-3 3 3'],
  rotate: ['M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8', 'M21 3v5h-5'],
  'flip-h': ['M12 3v18M9 6L3 19h6zM15 6l6 13h-6z'],
  'flip-v': ['M3 12h18M6 9L19 3v6zM6 15l13 6v-6z'],
  search: [c(11, 11, 7), 'M21 21l-5-5'],
  more: [c(5, 12, 1), c(12, 12, 1), c(19, 12, 1)],
  star: [star(12, 12.6, 10, 4.2, 5)],
  heart: ['M12 21C5.5 15.5 3 12.5 3 9a4.5 4.5 0 0 1 9-1.5A4.5 4.5 0 0 1 21 9c0 3.5-2.5 6.5-9 12z'],
  duplicate: [rr(8, 8, 13, 13, 2), 'M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3', 'M14.5 12.5v6M11.5 15.5h6'],
  template: [rr(3, 3, 18, 18, 2), 'M3 9h18M9 21V9'],
  palette: [
    'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z',
    c(13.5, 6.5, 0.5), c(17.5, 10.5, 0.5), c(6.5, 12.5, 0.5), c(8.5, 7.5, 0.5),
  ],
  brush: [
    'M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08',
    'M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z',
  ],
  wand: [
    'M21.64 3.64l-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72',
    'M14 7l3 3M5 6v4M19 14v4M10 2v2M7 8H3M21 16h-4M11 3H9',
  ],
  magnet: ['M6 3v12a6 6 0 0 0 12 0V3h-4v12a2 2 0 0 1-4 0V3z', 'M6 8h4M14 8h4'],
  guides: ['M8 2v20M16 2v20M2 8h20M2 16h20'],
  'safe-area': [rr(2, 4, 20, 16, 2), rr(6, 8, 12, 8, 1)],
  'text-box': [rr(3, 3, 18, 18, 2), 'M8 8h8M12 8v8'],
  music: ['M9 18V5l12-2v13', c(6, 18, 3), c(18, 16, 3)],
  volume: ['M11 5L6 9H2v6h4l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14'],
  sliders: ['M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6'],
  export: ['M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
  import: ['M12 3v12M8 11l4 4 4-4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4'],
  bookmark: ['M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z'],
  section: ['M8 4H5v16h3M12 8h9M12 12h9M12 16h6'],
  share: ['M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13'],
  keyboard: [rr(2, 5, 20, 14, 2), 'M6 9h.01M10 9h.01M14 9h.01M18 9h.01M7 15h10'],
  info: [c(12, 12, 9), 'M12 11v5M12 8h.01'],
  alert: ['M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9v4M12 17h.01'],
  history: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5', 'M12 7v5l3 2'],
};

// ── Content icons ────────────────────────────────────────────────────────────

const CONTENT: Record<string, string[]> = {
  'arrow-right': ['M5 12h14M13 6l6 6-6 6'],
  'arrow-left': ['M19 12H5M11 6l-6 6 6 6'],
  'arrow-up': ['M12 19V5M6 11l6-6 6 6'],
  'arrow-down': ['M12 5v14M6 13l6 6 6-6'],
  user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', c(12, 7, 4)],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', c(9, 7, 4), 'M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'],
  mail: [rr(2, 4, 20, 16, 2), 'M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'],
  globe: [c(12, 12, 10), 'M2 12h20', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'],
  rocket: [
    'M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z',
    'M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z',
    'M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0',
    'M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5',
  ],
  bolt: ['M13 2L4 14h7l-1 8 9-12h-7z'],
  bulb: ['M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5', 'M9 18h6M10 22h4'],
  trophy: [
    'M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16',
    'M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22',
    'M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22',
    'M18 2H6v7a6 6 0 0 0 12 0z',
  ],
  target: [c(12, 12, 10), c(12, 12, 6), c(12, 12, 2)],
  shield: ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z', 'M9 12l2 2 4-4'],
  cloud: ['M7 19a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 9a5 5 0 0 1 0 10z'],
  sun: [c(12, 12, 4), 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41'],
  moon: ['M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z'],
  phone: [rr(6, 2, 12, 20, 2.5), 'M11 18h2'],
  calendar: [rr(3, 5, 18, 16, 2), 'M3 10h18M8 3v4M16 3v4'],
  clock: [c(12, 12, 9), 'M12 7v5l3 2'],
  'map-pin': ['M20 10c0 5-5.5 10.2-7.4 11.8a1 1 0 0 1-1.2 0C9.5 20.2 4 15 4 10a8 8 0 0 1 16 0', c(12, 10, 3)],
  'trending-up': ['M3 17l6-6 4 4 8-8M15 7h6v6'],
  'trending-down': ['M3 7l6 6 4-4 8 8M15 17h6v-6'],
  dollar: ['M12 2v20', 'M17 6.5C16 5 14.5 4.5 12 4.5c-3 0-5 1.5-5 3.5s2 3 5 4 5 2 5 4-2 3.5-5 3.5c-2.5 0-4.5-.7-5.5-2.5'],
  code: ['M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16'],
  cpu: [rr(4, 4, 16, 16, 2), rr(9, 9, 6, 6, 1), 'M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2'],
  database: ['M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z', 'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  key: ['M21 2L11.4 11.6', 'M15.5 7.5l3 3L22 7l-3-3', c(7.5, 15.5, 5.5)],
  flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
  gift: [rr(3, 8, 18, 4, 1), 'M12 8v13', 'M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7', 'M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5'],
  home: ['M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8', 'M3 10a2 2 0 0 1 .71-1.53l7-6a2 2 0 0 1 2.58 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  bell: ['M10.27 21a2 2 0 0 0 3.46 0', 'M3.26 15.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67C19.41 13.96 18 12.5 18 8A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33'],
  mic: [rr(9, 2, 6, 12, 3), 'M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8'],
  wifi: ['M2 9a15 15 0 0 1 20 0M5 12.5a10.5 10.5 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0M12 19.5h.01'],
  battery: [rr(2, 6, 18, 12, 2), 'M22 11v2M6 10v4M10 10v4'],
  bag: ['M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0'],
  cart: [c(8, 21, 1), c(19, 21, 1), 'M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12'],
  coffee: ['M10 2v2M14 2v2M6 2v2', 'M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1'],
  book: ['M12 7v14', 'M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z'],
  pen: ['M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z', 'M15 5l4 4'],
  scissors: [c(6, 6, 3), 'M8.12 8.12L12 12M20 4L8.12 15.88', c(6, 18, 3), 'M14.8 14.8L20 20'],
  wrench: ['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'],
  puzzle: ['M4 7h5a2.5 2.5 0 1 1 4 0h7v5a2.5 2.5 0 1 1 0 4v5H4z'],
  compass: [c(12, 12, 10), 'M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36z'],
  anchor: ['M12 22V8', 'M5 12H2a10 10 0 0 0 20 0h-3', c(12, 5, 3)],
  award: [c(12, 8, 6), 'M15.48 12.89L17 22l-5-3-5 3 1.52-9.11'],
  briefcase: [rr(2, 7, 20, 14, 2), 'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16'],
  crown: ['M11.56 3.27a.5.5 0 0 1 .88 0l2.95 5.6a1 1 0 0 0 1.52.3l4.28-3.67a.5.5 0 0 1 .8.52l-2.83 10.25a1 1 0 0 1-.96.73H5.81a1 1 0 0 1-.96-.73L2.02 6.02a.5.5 0 0 1 .8-.52l4.28 3.67a1 1 0 0 0 1.52-.3z', 'M5 21h14'],
  flame: ['M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z'],
  leaf: ['M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z', 'M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12'],
  zap: ['M7 2h10l-4 8h6L8 22l2-9H5z'],
  smile: [c(12, 12, 10), 'M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01'],
  'thumbs-up': ['M7 10v12', 'M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z'],
  message: ['M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-7l-5 4v-4H6a2 2 0 0 1-2-2z'],
  send: ['M21 3L3 10.5l7 3 3 7z', 'M21 3L10 13.5'],
  'share-2': [c(18, 5, 3), c(6, 12, 3), c(18, 19, 3), 'M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98'],
  'pie-chart': ['M21.21 15.89A10 10 0 1 1 8 2.83', 'M22 12A10 10 0 0 0 12 2v10z'],
  'bar-chart': ['M3 3v18h18', 'M8 17v-5M13 17V8M18 17v-8'],
  activity: ['M22 12h-4l-3 9L9 3l-3 9H2'],
  'layers-2': ['M12 3l9 5-9 5-9-5z', 'M3 14l9 5 9-5'],
  box: ['M21 8l-9-5-9 5v8l9 5 9-5z', 'M3 8l9 5 9-5M12 13v8'],
  truck: ['M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2', 'M15 18H9', 'M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14', c(17, 18, 2), c(7, 18, 2)],
  plane: ['M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z'],
  car: ['M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2', c(7, 17, 2), 'M9 17h6', c(17, 17, 2)],
  tv: [rr(2, 7, 20, 15, 2), 'M17 2l-5 5-5-5'],
  headphones: ['M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3'],
  gamepad: ['M6 11h4M8 9v4M15 12h.01M18 10h.01', 'M17.32 5H6.68a4 4 0 0 0-3.98 3.59C2.6 9.42 2 14.46 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.41-1.41A2 2 0 0 1 9.83 16h4.34a2 2 0 0 1 1.41.59L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.55-.6-6.58-.69-7.26A4 4 0 0 0 17.32 5z'],
  medal: ['M7.21 15L2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15', 'M11 12L5.12 2.2M13 12l5.88-9.8M8 7h8', c(12, 17, 5), 'M12 18v-2h-.5'],
  swords: ['M14.5 17.5L3 6V3h3l11.5 11.5', 'M13 19l6-6M16 16l4 4M19 21l2-2', 'M14.5 6.5L18 3h3v3l-3.5 3.5', 'M5 14l4 4M7 17l-3 3M3 19l2 2'],
  crosshair: [c(12, 12, 10), 'M22 12h-4M6 12H2M12 6V2M12 22v-4'],
  radio: ['M4.9 19.1C1 15.2 1 8.8 4.9 4.9', 'M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5', c(12, 12, 2), 'M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5', 'M19.1 4.9C23 8.8 23 15.1 19.1 19'],
  signal: ['M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16'],
};

export const ICONS: Record<string, string[]> = { ...UI, ...CONTENT };

// ── Picker metadata ──────────────────────────────────────────────────────────

export const ICON_GROUPS: { name: string; icons: string[] }[] = [
  { name: 'Basics', icons: ['star', 'heart', 'check', 'x', 'plus', 'minus', 'info', 'alert', 'bookmark', 'search', 'eye', 'lock', 'link', 'settings', 'home', 'bell', 'flag'] },
  { name: 'Arrows', icons: ['arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'trending-up', 'trending-down', 'send', 'share-2'] },
  { name: 'People & chat', icons: ['user', 'users', 'smile', 'thumbs-up', 'message', 'mail', 'phone', 'mic', 'globe'] },
  { name: 'Business', icons: ['briefcase', 'dollar', 'pie-chart', 'bar-chart', 'activity', 'target', 'trophy', 'medal', 'award', 'crown', 'calendar', 'clock', 'bag', 'cart', 'gift'] },
  { name: 'Tech', icons: ['code', 'cpu', 'database', 'wifi', 'signal', 'battery', 'key', 'shield', 'bolt', 'zap', 'rocket', 'tv', 'headphones', 'radio'] },
  { name: 'Nature & places', icons: ['sun', 'moon', 'cloud', 'leaf', 'flame', 'map-pin', 'compass', 'anchor'] },
  { name: 'Objects', icons: ['bulb', 'book', 'pen', 'scissors', 'wrench', 'puzzle', 'coffee', 'box', 'layers-2', 'gamepad', 'swords', 'crosshair'] },
  { name: 'Transport', icons: ['truck', 'plane', 'car'] },
];

export const ICON_KEYWORDS: Record<string, string> = {
  'arrow-right': 'next forward direction',
  'arrow-left': 'back previous direction',
  'arrow-up': 'increase top direction',
  'arrow-down': 'decrease bottom direction',
  user: 'person profile account avatar',
  users: 'people team group community audience',
  mail: 'email envelope message inbox',
  globe: 'world earth international web internet global',
  rocket: 'launch startup space fast growth',
  bolt: 'lightning power energy fast electric',
  bulb: 'idea light innovation tip insight',
  trophy: 'win award champion success prize',
  target: 'goal aim focus bullseye objective',
  shield: 'security protect safe trust guard',
  cloud: 'weather storage sky online',
  sun: 'day light bright weather summer',
  moon: 'night dark sleep lunar',
  phone: 'mobile call smartphone device',
  calendar: 'date schedule event day plan',
  clock: 'time hour watch schedule',
  'map-pin': 'location place address marker',
  'trending-up': 'growth increase rise profit chart',
  'trending-down': 'decline decrease fall loss chart',
  dollar: 'money price cost currency finance revenue',
  code: 'programming developer software html',
  cpu: 'processor chip hardware computer',
  database: 'data storage server sql',
  key: 'access password unlock security',
  flag: 'milestone goal report country',
  gift: 'present reward bonus surprise',
  home: 'house building main',
  bell: 'notification alert reminder alarm',
  mic: 'microphone audio voice podcast record',
  wifi: 'wireless network internet connection',
  battery: 'power charge energy',
  bag: 'shopping retail store purchase',
  cart: 'shopping basket buy ecommerce store',
  coffee: 'cup drink break cafe',
  book: 'read learn education library',
  pen: 'write edit pencil draw',
  scissors: 'cut trim tool',
  wrench: 'tool fix settings repair build',
  puzzle: 'piece solution fit game',
  compass: 'direction navigate explore guide',
  anchor: 'harbor ship stable port',
  award: 'badge prize ribbon achievement',
  briefcase: 'work job business portfolio',
  crown: 'king queen royal leader premium',
  flame: 'fire hot trending popular',
  leaf: 'nature eco green plant sustainable',
  zap: 'lightning bolt energy fast',
  smile: 'happy face emoji friendly',
  'thumbs-up': 'like approve good yes',
  message: 'chat comment bubble talk',
  send: 'paper plane submit deliver',
  'share-2': 'network connect social',
  'pie-chart': 'chart data analytics share',
  'bar-chart': 'chart data analytics statistics',
  activity: 'pulse heartbeat chart health',
  'layers-2': 'stack levels',
  box: 'package product cube delivery',
  truck: 'delivery shipping transport logistics',
  plane: 'airplane flight travel airline',
  car: 'vehicle drive auto automobile',
  tv: 'television screen display media',
  headphones: 'audio music listen support',
  gamepad: 'game controller play gaming',
  medal: 'award prize rank winner',
  swords: 'battle fight compete',
  crosshair: 'aim target precision',
  radio: 'broadcast signal wave',
  signal: 'reception bars connectivity strength',
  star: 'favorite rating featured',
  heart: 'love favorite like health',
  check: 'done tick yes complete success',
  x: 'close cancel no remove',
  plus: 'add new create',
  minus: 'remove subtract less',
  info: 'information help about',
  alert: 'warning caution danger attention',
  bookmark: 'save saved marker',
  search: 'find magnify zoom lookup',
  eye: 'view visible watch',
  lock: 'secure private closed',
  link: 'chain url connect',
  settings: 'gear cog preferences options',
};

// ── Access & drawing ─────────────────────────────────────────────────────────

export function iconPaths(name: string): string[] {
  return ICONS[name] ?? [];
}

const pathCache = new Map<string, Path2D>();

function iconPath2D(name: string): Path2D | null {
  const hit = pathCache.get(name);
  if (hit) return hit;
  const paths = ICONS[name];
  if (!paths) return null;
  const p = new Path2D();
  for (const d of paths) p.addPath(new Path2D(d));
  pathCache.set(name, p);
  return p;
}

export function drawIcon(ctx: CanvasRenderingContext2D, name: string, w: number, h: number, color: string, strokeWidth = 1.75): void {
  const s = Math.min(w, h) / 24;
  if (!(s > 0) || !Number.isFinite(s)) return;
  ctx.save();
  ctx.translate((w - 24 * s) / 2, (h - 24 * s) / 2);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const p = iconPath2D(name);
  if (p) {
    ctx.stroke(p);
  } else {
    ctx.setLineDash([2.5, 2.5]);
    ctx.strokeRect(4, 4, 16, 16);
  }
  ctx.restore();
}
