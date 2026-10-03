import { strFromU8, unzipSync } from 'fflate';
import { newImage, newLine, newShape, newSlide, newText, solid, strokeOf, textBase } from '../model/defaults';
import { uid } from '../model/ids';
import type {
  Align, Arrowhead, AssetMeta, Color, DesignSystem, El, Fill, ImageEl, LineEl, Para, RichDoc, Run, ShapeKind, Slide, Stroke, TableEl, TextBase,
} from '../model/types';

/** Best-effort PowerPoint (.pptx) import. Anything unsupported becomes a warning, never an exception. */

export interface ImportedAsset {
  meta: AssetMeta;
  blob: Blob;
}

export interface ImportResult {
  slides: Slide[];
  assets: ImportedAsset[];
  /** Slide size of the source, scaled to the target width. */
  size?: { w: number; h: number };
  warnings: string[];
  title?: string;
}

const MAX_UNCOMPRESSED = 1.5 * 1024 * 1024 * 1024;
const EMU_PER_PT = 12700;

// ── XML helpers ──────────────────────────────────────────────────────────────

type Files = Record<string, Uint8Array>;

function parseXml(files: Files, path: string): Document | null {
  const data = files[path];
  if (!data) return null;
  try {
    const doc = new DOMParser().parseFromString(strFromU8(data), 'application/xml');
    return doc.getElementsByTagName('parsererror').length ? null : doc;
  } catch {
    return null;
  }
}

const kids = (e: Element | null | undefined, name?: string): Element[] =>
  e ? Array.from(e.children).filter((c) => !name || c.localName === name) : [];
const kid = (e: Element | null | undefined, name: string): Element | null => kids(e, name)[0] ?? null;
/** Walk down a chain of child names. */
const at = (e: Element | null | undefined, ...names: string[]): Element | null => names.reduce<Element | null | undefined>((cur, n) => kid(cur, n), e) ?? null;
const attrN = (e: Element | null | undefined, name: string, d = 0): number => {
  const v = e?.getAttribute(name);
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : d;
};
const descendants = (e: Element, name: string): Element[] => Array.from(e.getElementsByTagNameNS('*', name));

// ── Relationships & paths ────────────────────────────────────────────────────

interface Rel {
  type: string;
  /** Resolved package path, or the URL when external. */
  target: string;
  external: boolean;
}

function resolvePath(fromDir: string, target: string): string {
  const parts = target.startsWith('/') ? [] : fromDir.split('/').filter(Boolean);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

function readRels(files: Files, part: string): Map<string, Rel> {
  const i = part.lastIndexOf('/');
  const dir = part.slice(0, i + 1);
  const doc = parseXml(files, `${dir}_rels/${part.slice(i + 1)}.rels`);
  const out = new Map<string, Rel>();
  if (!doc) return out;
  for (const r of descendants(doc.documentElement, 'Relationship')) {
    const id = r.getAttribute('Id');
    const target = r.getAttribute('Target');
    if (!id || !target) continue;
    const external = r.getAttribute('TargetMode') === 'External';
    out.set(id, { type: r.getAttribute('Type') ?? '', target: external ? target : resolvePath(dir, target), external });
  }
  return out;
}

const relOfType = (rels: Map<string, Rel>, suffix: string): Rel | undefined => [...rels.values()].find((r) => r.type.endsWith(suffix));

// ── Colour ───────────────────────────────────────────────────────────────────

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const hex2 = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');

function hexToRgb(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    return 255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p);
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

/** Apply the OOXML colour transforms we understand (lumMod/lumOff/tint/shade/alpha). */
function applyMods(hex: string, node: Element): Color {
  let rgb = hexToRgb(hex);
  let alpha = 1;
  for (const m of kids(node)) {
    const v = attrN(m, 'val', 100000) / 100000;
    if (m.localName === 'lumMod' || m.localName === 'lumOff') {
      const [h, s, l] = rgbToHsl(rgb);
      rgb = hslToRgb([h, s, clamp01(m.localName === 'lumMod' ? l * v : l + v)]);
    } else if (m.localName === 'tint') rgb = rgb.map((c) => c * v + 255 * (1 - v)) as typeof rgb;
    else if (m.localName === 'shade') rgb = rgb.map((c) => c * v) as typeof rgb;
    else if (m.localName === 'alpha') alpha = v;
  }
  const base = `#${hex2(rgb[0])}${hex2(rgb[1])}${hex2(rgb[2])}`;
  return alpha < 1 ? base + hex2(alpha * 255) : base;
}

const PRESET_COLORS: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', gray: '#808080', grey: '#808080', orange: '#ffa500',
};

/** Scheme names used when the deck has no readable theme: map onto the Frames theme tokens. */
const TOKEN_FOR_SCHEME: Record<string, string> = {
  tx1: '@text', dk1: '@text', bg1: '@bg', lt1: '@bg', tx2: '@muted', dk2: '@muted', bg2: '@surface', lt2: '@surface',
  accent1: '@primary', accent2: '@secondary', accent3: '@accent', accent4: '@success', accent5: '@danger', accent6: '@primary', hlink: '@primary', folHlink: '@secondary',
};

// ── Import context ───────────────────────────────────────────────────────────

interface Ctx {
  files: Files;
  /** EMU → slide units. */
  k: number;
  warnings: string[];
  assets: Map<string, ImportedAsset>;
  /** dk1, lt1, accent1 … → '#rrggbb' from ppt/theme/theme1.xml. */
  scheme: Map<string, string>;
  clrMap: Record<string, string>;
  fonts: { major?: string; minor?: string };
  ds: DesignSystem;
}

interface SlideCtx {
  c: Ctx;
  n: number;
  rels: Map<string, Rel>;
  layout: Document | null;
  master: Document | null;
  elements: El[];
}

function readScheme(files: Files): { scheme: Map<string, string>; fonts: Ctx['fonts'] } {
  const scheme = new Map<string, string>();
  const doc = parseXml(files, 'ppt/theme/theme1.xml');
  const fonts: Ctx['fonts'] = {};
  if (!doc) return { scheme, fonts };
  const cs = descendants(doc.documentElement, 'clrScheme')[0];
  for (const slot of kids(cs)) {
    const v = kids(slot)[0];
    const hex = v?.getAttribute('val') ?? '';
    const last = v?.getAttribute('lastClr');
    if (v?.localName === 'srgbClr' && /^[0-9a-f]{6}$/i.test(hex)) scheme.set(slot.localName, `#${hex.toLowerCase()}`);
    else if (last && /^[0-9a-f]{6}$/i.test(last)) scheme.set(slot.localName, `#${last.toLowerCase()}`);
  }
  const fs = descendants(doc.documentElement, 'fontScheme')[0];
  fonts.major = at(fs, 'majorFont', 'latin')?.getAttribute('typeface') ?? undefined;
  fonts.minor = at(fs, 'minorFont', 'latin')?.getAttribute('typeface') ?? undefined;
  return { scheme, fonts };
}

/** The colour inside a node such as `a:solidFill` or `a:fontRef`. */
function colorIn(c: Ctx, parent: Element | null | undefined): Color | undefined {
  const node = kids(parent).find((e) => ['srgbClr', 'schemeClr', 'sysClr', 'prstClr'].includes(e.localName));
  if (!node) return undefined;
  const val = node.getAttribute('val') ?? '';
  switch (node.localName) {
    case 'srgbClr':
      return /^[0-9a-f]{6}$/i.test(val) ? applyMods(`#${val.toLowerCase()}`, node) : undefined;
    case 'sysClr': {
      const last = node.getAttribute('lastClr');
      return applyMods(last && /^[0-9a-f]{6}$/i.test(last) ? `#${last.toLowerCase()}` : val === 'window' ? '#ffffff' : '#000000', node);
    }
    case 'prstClr':
      return applyMods(PRESET_COLORS[val] ?? '#000000', node);
    default: {
      const slot = c.clrMap[val] ?? val;
      const hex = c.scheme.get(slot);
      if (hex) return applyMods(hex, node);
      return TOKEN_FOR_SCHEME[val] ?? '@text';
    }
  }
}

const defaultTextColor = (c: Ctx): Color => c.scheme.get(c.clrMap.tx1 ?? 'dk1') ?? '@text';

function readClrMap(files: Files): Record<string, string> {
  const doc = parseXml(files, 'ppt/slideMasters/slideMaster1.xml');
  const m = doc ? descendants(doc.documentElement, 'clrMap')[0] : undefined;
  const out: Record<string, string> = {};
  if (m) for (const a of Array.from(m.attributes)) out[a.name] = a.value;
  return out;
}

// ── Fills & strokes ──────────────────────────────────────────────────────────

function fillOf(c: Ctx, el: Element | null | undefined): Fill | null | undefined {
  if (!el) return undefined;
  switch (el.localName) {
    case 'noFill':
      return null;
    case 'solidFill': {
      const col = colorIn(c, el);
      return col ? solid(col) : undefined;
    }
    case 'gradFill': {
      const stops = kids(at(el, 'gsLst'), 'gs')
        .map((gs) => ({ o: clamp01(attrN(gs, 'pos') / 100000), c: colorIn(c, gs) }))
        .filter((s): s is { o: number; c: Color } => !!s.c);
      if (stops.length < 2) return stops[0] ? solid(stops[0].c) : undefined;
      const isPath = !!kid(el, 'path');
      if (isPath) return { t: 'radial', stops };
      // OOXML: 0° runs left→right, clockwise. Frames' angle: 0° points up, clockwise (CSS).
      const ang = attrN(kid(el, 'lin'), 'ang') / 60000;
      return { t: 'linear', angle: (ang + 90) % 360, stops };
    }
    default:
      return undefined;
  }
}

/** The first fill-type child of a `p:spPr` / `p:bgPr`. */
const fillChild = (e: Element | null | undefined) => kids(e).find((k) => ['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill'].includes(k.localName)) ?? null;

function strokeOfLn(c: Ctx, ln: Element | null | undefined, fallbackColor?: Color): Stroke | null | undefined {
  if (!ln) return fallbackColor ? strokeOf(fallbackColor, EMU_PER_PT * c.k) : undefined;
  if (kid(ln, 'noFill')) return null;
  const col = colorIn(c, kid(ln, 'solidFill')) ?? fallbackColor;
  if (!col) return undefined;
  const w = Math.max(1, (ln.hasAttribute('w') ? attrN(ln, 'w') : 9525) * c.k);
  const dash = at(ln, 'prstDash')?.getAttribute('val') ?? 'solid';
  return strokeOf(col, w, dash === 'solid' ? 'solid' : /dot/i.test(dash) && !/dash/i.test(dash) ? 'dot' : 'dash');
}

// ── Geometry ─────────────────────────────────────────────────────────────────

type M = [number, number, number, number, number, number];
const IDENTITY: M = [1, 0, 0, 1, 0, 0];
const mul = (p: M, q: M): M => [
  p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5],
];
const translate = (x: number, y: number): M => [1, 0, 0, 1, x, y];
const scaleM = (x: number, y: number): M => [x, 0, 0, y, 0, 0];
const rotateM = (deg: number): M => {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
};

interface Xfrm {
  x: number; y: number; cx: number; cy: number; rot: number; flipH: boolean; flipV: boolean;
  chX: number; chY: number; chCx: number; chCy: number;
}

function readXfrm(e: Element | null | undefined): Xfrm | null {
  if (!e) return null;
  const off = kid(e, 'off'), ext = kid(e, 'ext'), chOff = kid(e, 'chOff'), chExt = kid(e, 'chExt');
  if (!off || !ext) return null;
  return {
    x: attrN(off, 'x'), y: attrN(off, 'y'), cx: attrN(ext, 'cx'), cy: attrN(ext, 'cy'),
    rot: attrN(e, 'rot') / 60000, flipH: e.getAttribute('flipH') === '1' || e.getAttribute('flipH') === 'true', flipV: e.getAttribute('flipV') === '1' || e.getAttribute('flipV') === 'true',
    chX: attrN(chOff, 'x'), chY: attrN(chOff, 'y'), chCx: attrN(chExt, 'cx', attrN(ext, 'cx')), chCy: attrN(chExt, 'cy', attrN(ext, 'cy')),
  };
}

/** child space → parent space for a group. */
function groupMatrix(parent: M, g: Xfrm): M {
  const kx = g.chCx ? g.cx / g.chCx : 1, ky = g.chCy ? g.cy / g.chCy : 1;
  const cx = g.x + g.cx / 2, cy = g.y + g.cy / 2;
  let m = mul(translate(g.x, g.y), mul(scaleM(kx, ky), translate(-g.chX, -g.chY)));
  m = mul(scaleM(g.flipH ? -1 : 1, g.flipV ? -1 : 1), mul(translate(-cx, -cy), m));
  m = mul(translate(cx, cy), mul(rotateM(g.rot), m));
  return mul(parent, m);
}

interface Placed { x: number; y: number; w: number; h: number; rot: number; flipX: boolean; flipY: boolean }

function place(k: number, m: M, xf: Xfrm): Placed {
  const cx = xf.x + xf.cx / 2, cy = xf.y + xf.cy / 2;
  const px = m[0] * cx + m[2] * cy + m[4], py = m[1] * cx + m[3] * cy + m[5];
  const w = xf.cx * Math.hypot(m[0], m[1]) * k, h = xf.cy * Math.hypot(m[2], m[3]) * k;
  const det = m[0] * m[3] - m[1] * m[2];
  const rot = (((xf.rot + (Math.atan2(m[1], m[0]) * 180) / Math.PI) % 360) + 360) % 360;
  return { x: px * k - w / 2, y: py * k - h / 2, w, h, rot, flipX: xf.flipH !== det < 0, flipY: xf.flipV };
}

function applyPlace<T extends El>(el: T, p: Placed, flips = true): T {
  el.x = p.x; el.y = p.y; el.w = p.w; el.h = p.h; el.rot = p.rot;
  if (flips) {
    if (p.flipX) el.flipX = true;
    if (p.flipY) el.flipY = true;
  }
  return el;
}

const SHAPES: Record<string, ShapeKind> = {
  rect: 'rect', flowChartProcess: 'rect', snip1Rect: 'rect', round1Rect: 'round-rect', roundRect: 'round-rect', round2SameRect: 'round-rect',
  ellipse: 'ellipse', flowChartConnector: 'ellipse', triangle: 'triangle', rtTriangle: 'right-triangle', diamond: 'diamond', flowChartDecision: 'diamond',
  pentagon: 'pentagon', hexagon: 'hexagon', octagon: 'octagon', star4: 'star', star5: 'star', star6: 'star', star7: 'star', star8: 'star', star10: 'star', star12: 'star',
  star16: 'burst', star24: 'burst', star32: 'burst', irregularSeal1: 'burst', irregularSeal2: 'burst',
  rightArrow: 'arrow-right', homePlate: 'arrow-right', leftArrow: 'arrow-left', upArrow: 'arrow-up', downArrow: 'arrow-down',
  chevron: 'chevron', parallelogram: 'parallelogram', trapezoid: 'trapezoid', mathPlus: 'plus', plus: 'plus', cross: 'plus',
  heart: 'heart', cloud: 'cloud', wedgeRectCallout: 'speech', wedgeRoundRectCallout: 'speech', wedgeEllipseCallout: 'speech', cloudCallout: 'speech',
  donut: 'ring', flowChartTerminator: 'pill', halfFrame: 'half-circle', chord: 'half-circle', pie: 'half-circle',
};
const STAR_POINTS: Record<string, number> = { star4: 4, star5: 5, star6: 6, star7: 7, star8: 8, star10: 10, star12: 12 };

const ARROWS: Record<string, Arrowhead> = { triangle: 'triangle', arrow: 'arrow', stealth: 'arrow', oval: 'dot', diamond: 'diamond' };

// ── Media ────────────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
};

/** Intrinsic size from the file header (PNG, GIF, JPEG) when it is cheap to find. */
function imageSize(b: Uint8Array): { w: number; h: number } | undefined {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length > 24 && dv.getUint32(0) === 0x89504e47) return { w: dv.getUint32(16), h: dv.getUint32(20) };
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { w: dv.getUint16(6, true), h: dv.getUint16(8, true) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return undefined;
      const marker = b[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { h: dv.getUint16(i + 5), w: dv.getUint16(i + 7) };
      i += 2 + dv.getUint16(i + 2);
    }
  }
  return undefined;
}

function addMedia(sc: SlideCtx, path: string): AssetMeta | null {
  const c = sc.c;
  const known = c.assets.get(path);
  if (known) return known.meta;
  const data = c.files[path];
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  const mime = MIME[ext];
  if (!data || !mime) {
    c.warnings.push(`Slide ${sc.n}: a${/^[aeiou]/.test(ext) ? 'n' : ''} ${ext ? ext.toUpperCase() : 'unknown'} image can't be imported and was skipped`);
    return null;
  }
  const dim = ext === 'svg' ? undefined : imageSize(data);
  const meta: AssetMeta = { id: uid('as'), name: path.slice(path.lastIndexOf('/') + 1), kind: ext === 'svg' ? 'svg' : 'image', mime, bytes: data.length, ...dim };
  c.assets.set(path, { meta, blob: new Blob([data as BlobPart], { type: mime }) });
  return meta;
}

// ── Text ─────────────────────────────────────────────────────────────────────

const FONT_ALIASES: Record<string, string> = {
  arial: 'Helvetica', helvetica: 'Helvetica', 'helvetica neue': 'Helvetica', 'times new roman': 'Times', times: 'Times', georgia: 'Georgia', verdana: 'Verdana',
  'trebuchet ms': 'Trebuchet', impact: 'Impact', 'courier new': 'Courier', courier: 'Courier', consolas: 'Menlo', menlo: 'Menlo', palatino: 'Palatino',
  'palatino linotype': 'Palatino', 'book antiqua': 'Palatino', futura: 'Futura', inter: 'Inter',
};

function mapFont(c: Ctx, face: string | null | undefined, fallback: string): string {
  if (!face) return fallback;
  const named = (f: string | undefined, d: string) => (f && FONT_ALIASES[f.toLowerCase()]) || d;
  if (face === '+mj-lt') return named(c.fonts.major, '@heading');
  if (face === '+mn-lt') return named(c.fonts.minor, '@body');
  return named(face, '@body');
}

type PhInfo = { type?: string; idx?: string };

const phOf = (sp: Element): PhInfo | null => {
  const ph = at(sp, 'nvSpPr', 'nvPr', 'ph');
  return ph ? { type: ph.getAttribute('type') ?? undefined, idx: ph.getAttribute('idx') ?? undefined } : null;
};

type PhKey = 'title' | 'subTitle' | 'body' | 'other';
function phKey(ph: PhInfo | null): PhKey | null {
  if (!ph) return null;
  switch (ph.type) {
    case 'title': case 'ctrTitle': return 'title';
    case 'subTitle': return 'subTitle';
    case undefined: case 'body': case 'obj': return 'body';
    default: return 'other';
  }
}

function findPhShape(doc: Document | null, ph: PhInfo, isMaster = false): Element | null {
  if (!doc) return null;
  const want = phKey(ph);
  for (const sp of descendants(doc.documentElement, 'sp')) {
    const p = phOf(sp);
    if (!p) continue;
    if (!isMaster && ph.idx && p.idx === ph.idx) return sp;
    const k = phKey(p);
    if (k === want || (isMaster && want === 'subTitle' && k === 'body')) if (isMaster || !ph.idx || p.idx === undefined) return sp;
  }
  return null;
}

/** Size (EMU) from an inheritance source: a shape's lstStyle or a master txStyles entry. */
const defSz = (lvlHost: Element | null | undefined, lvl: number): number | undefined => {
  const sz = at(lvlHost, `lvl${lvl + 1}pPr`, 'defRPr')?.getAttribute('sz');
  return sz ? Number(sz) : undefined;
};

function inheritedSize(sc: SlideCtx, ph: PhInfo | null, lvl: number): number | undefined {
  if (!ph) return undefined;
  const fromLayout = defSz(at(findPhShape(sc.layout, ph), 'txBody', 'lstStyle'), lvl);
  if (fromLayout) return fromLayout;
  const fromMasterShape = defSz(at(findPhShape(sc.master, ph, true), 'txBody', 'lstStyle'), lvl);
  if (fromMasterShape) return fromMasterShape;
  const k = phKey(ph);
  const styles = sc.master ? descendants(sc.master.documentElement, 'txStyles')[0] : undefined;
  return defSz(at(styles, k === 'title' ? 'titleStyle' : k === 'other' ? 'otherStyle' : 'bodyStyle'), lvl);
}

const ALIGN: Record<string, Align> = { l: 'left', ctr: 'center', r: 'right', just: 'justify', dist: 'justify' };

interface TextOpts {
  ph: PhInfo | null;
  /** Colour for text with no explicit colour (shapes with a fontRef use the style's). */
  color: Color;
}

interface Parsed {
  doc: RichDoc;
  base: TextBase;
  pad: number;
  vAlign: 'top' | 'middle' | 'bottom';
  fit: 'none' | 'shrink' | 'grow';
  empty: boolean;
}

function parseTextBody(sc: SlideCtx, body: Element, opts: TextOpts): Parsed {
  const c = sc.c;
  const key = phKey(opts.ph);
  const lst = kid(body, 'lstStyle');
  const baseFont = key === 'title' ? '@heading' : '@body';
  const defaultSize = key === 'title' ? c.ds.type.title : key === 'subTitle' ? c.ds.type.heading : c.ds.type.body;
  const toUnits = (hundredths: number) => (hundredths / 100) * EMU_PER_PT * c.k;

  interface Raw extends Run { size: number; font: string; c: Color }
  const raw: { runs: Raw[]; para: Omit<Para, 'runs'> }[] = [];

  for (const p of kids(body, 'p')) {
    const pPr = kid(p, 'pPr');
    const lvl = attrN(pPr, 'lvl');
    const sizeFallback = (hundredths?: number) => (hundredths ?? defSz(lst, lvl) ?? inheritedSize(sc, opts.ph, lvl) ?? 1800);

    const runs: Raw[] = [];
    const push = (rPr: Element | null, text: string) => {
      const sz = rPr?.hasAttribute('sz') ? attrN(rPr, 'sz') : undefined;
      const r: Raw = {
        t: text,
        size: toUnits(sizeFallback(sz)),
        font: mapFont(c, at(rPr, 'latin')?.getAttribute('typeface'), baseFont),
        c: colorIn(c, kid(rPr, 'solidFill')) ?? opts.color,
      };
      if (rPr?.getAttribute('b') === '1') r.b = true;
      if (rPr?.getAttribute('i') === '1') r.i = true;
      const u = rPr?.getAttribute('u');
      if (u && u !== 'none') r.u = true;
      const st = rPr?.getAttribute('strike');
      if (st && st !== 'noStrike') r.s = true;
      const bl = attrN(rPr, 'baseline');
      if (bl > 0) r.sup = true;
      else if (bl < 0) r.sub = true;
      if (rPr?.hasAttribute('spc')) r.ls = (attrN(rPr, 'spc') / 100) * EMU_PER_PT * c.k;
      const hl = colorIn(c, kid(rPr, 'highlight'));
      if (hl) r.hl = hl;
      const link = sc.rels.get(at(rPr, 'hlinkClick')?.getAttribute('r:id') ?? '');
      if (link?.external) r.link = link.target;
      runs.push(r);
    };
    for (const n of kids(p)) {
      if (n.localName === 'r' || n.localName === 'fld') push(kid(n, 'rPr'), kid(n, 't')?.textContent ?? '');
      else if (n.localName === 'br') push(kid(n, 'rPr'), '\n');
    }
    if (!runs.length) push(kid(p, 'endParaRPr'), '');

    const para: Omit<Para, 'runs'> = {};
    const algn = ALIGN[pPr?.getAttribute('algn') ?? ''];
    if (algn) para.align = algn;
    if (lvl > 0) para.level = Math.min(4, lvl);
    if (kid(pPr, 'buAutoNum')) para.list = 'number';
    else if (kid(pPr, 'buChar')) para.list = 'bullet';
    else if (!kid(pPr, 'buNone') && key === 'body' && opts.ph) para.list = 'bullet';
    const lnSpc = attrN(at(pPr, 'lnSpc', 'spcPct'), 'val');
    if (lnSpc > 0) para.lh = (lnSpc / 100000) * 1.2;
    const bef = attrN(at(pPr, 'spcBef', 'spcPts'), 'val'), aft = attrN(at(pPr, 'spcAft', 'spcPts'), 'val');
    if (bef) para.before = toUnits(bef);
    if (aft) para.after = toUnits(aft);
    raw.push({ runs, para });
  }

  // Base style comes from the first run with text; runs only keep what differs from it.
  const first = raw.flatMap((p) => p.runs).find((r) => r.t.trim()) ?? raw[0]?.runs[0];
  const base: TextBase = {
    ...textBase(c.ds, 'body', { font: first?.font ?? baseFont, size: first?.size ?? toUnits(defaultSize), color: first?.c ?? opts.color, weight: 400, lh: 1.2, ls: 0 }),
  };
  const firstAlign = raw.find((p) => p.para.align)?.para.align;
  if (firstAlign) base.align = firstAlign;
  const empty = raw.every((p) => p.runs.every((r) => !r.t.trim()));

  const doc: RichDoc = raw.map(({ runs, para }) => ({
    ...para,
    align: para.align === base.align ? undefined : para.align,
    runs: runs.map(({ size, font, c: col, ...r }) => {
      const out: Run = { ...r };
      if (Math.abs(size - base.size) > 0.5) out.size = size;
      if (font !== base.font) out.font = font;
      if (col !== base.color) out.c = col;
      return out;
    }),
  }));
  for (const p of doc) if (p.align === undefined) delete p.align;

  const bodyPr = kid(body, 'bodyPr');
  const anchor = bodyPr?.getAttribute('anchor');
  const inset = (n: string) => (bodyPr?.hasAttribute(n) ? attrN(bodyPr, n) : 91440) * c.k;
  return {
    doc,
    base,
    pad: Math.round((inset('lIns') + inset('rIns') + inset('tIns') + inset('bIns')) / 4),
    vAlign: anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top',
    fit: kid(bodyPr, 'normAutofit') ? 'shrink' : kid(bodyPr, 'spAutoFit') ? 'grow' : 'none',
    empty,
  };
}

const plainText = (body: Element | null): string =>
  kids(body, 'p').map((p) => descendants(p, 't').map((t) => t.textContent ?? '').join('')).join('\n').trim();

// ── Shapes ───────────────────────────────────────────────────────────────────

/** Resolve a placeholder's xfrm from its layout, then its master. */
function inheritedXfrm(sc: SlideCtx, ph: PhInfo): Xfrm | null {
  const from = (doc: Document | null, master: boolean) => readXfrm(at(findPhShape(doc, ph, master), 'spPr', 'xfrm'));
  return from(sc.layout, false) ?? from(sc.master, true);
}

/** SVG path data for a simple `a:custGeom`; null when it uses arcs we don't convert. */
function customPath(g: Element): { d: string; vb: [number, number] } | null {
  const path = at(g, 'pathLst', 'path');
  if (!path) return null;
  const w = attrN(path, 'w', 100), h = attrN(path, 'h', 100);
  const pt = (e: Element | null) => `${attrN(e, 'x')} ${attrN(e, 'y')}`;
  let d = '';
  for (const s of kids(path)) {
    const pts = kids(s, 'pt');
    switch (s.localName) {
      case 'moveTo': d += `M${pt(pts[0] ?? null)}`; break;
      case 'lnTo': d += `L${pt(pts[0] ?? null)}`; break;
      case 'cubicBezTo': d += `C${pts.map(pt).join(' ')}`; break;
      case 'quadBezTo': d += `Q${pts.map(pt).join(' ')}`; break;
      case 'close': d += 'Z'; break;
      default: return null;
    }
  }
  return d ? { d, vb: [w, h] } : null;
}

function styleColors(sc: SlideCtx, sp: Element) {
  const style = kid(sp, 'style');
  const c = sc.c;
  return {
    fill: colorIn(c, kid(style, 'fillRef')),
    line: colorIn(c, kid(style, 'lnRef')),
    font: colorIn(c, kid(style, 'fontRef')),
    hasFillRef: attrN(kid(style, 'fillRef'), 'idx') > 0,
    hasLnRef: attrN(kid(style, 'lnRef'), 'idx') > 0,
  };
}

function handleSp(sc: SlideCtx, sp: Element, m: M): void {
  const c = sc.c;
  const spPr = kid(sp, 'spPr');
  const ph = phOf(sp);
  const xf = readXfrm(kid(spPr, 'xfrm')) ?? (ph ? inheritedXfrm(sc, ph) : null);
  if (!xf) return;
  const placed = place(c.k, m, xf);

  const geom = kid(spPr, 'prstGeom');
  const cust = kid(spPr, 'custGeom');
  const prst = geom?.getAttribute('prst') ?? (cust ? 'custom' : 'rect');
  const sty = styleColors(sc, sp);

  const fillEl = fillChild(spPr);
  let fill = fillEl?.localName === 'blipFill' || fillEl?.localName === 'pattFill' ? undefined : fillOf(c, fillEl);
  if (fill === undefined && !fillEl && sty.hasFillRef && sty.fill) fill = solid(sty.fill);
  const visibleStroke = strokeOfLn(c, kid(spPr, 'ln'), sty.hasLnRef ? sty.line : undefined) ?? null;

  const body = kid(sp, 'txBody');
  const text = body ? parseTextBody(sc, body, { ph, color: sty.font ?? defaultTextColor(c) }) : null;
  const hasText = !!text && !text.empty;

  // Plain connectors drawn as shapes.
  if (prst === 'line' || prst === 'straightConnector1') return pushLine(sc, sp, placed, prst, visibleStroke ?? strokeOf(sty.line ?? '@text', EMU_PER_PT * c.k));

  if (ph && !hasText && !fill && !visibleStroke) return; // empty placeholder: PowerPoint doesn't draw it
  const isBox = at(sp, 'nvSpPr', 'cNvSpPr')?.getAttribute('txBox') === '1';
  const rectLike = prst === 'rect' || ph != null;

  if (text && hasText && (isBox || (rectLike && !fill && !visibleStroke))) {
    const t = newText(c.ds, '', placed.x, placed.y, placed.w, 'body', { doc: text.doc, base: text.base, pad: text.pad, vAlign: text.vAlign, fit: text.fit, fill: fill ?? null, stroke: visibleStroke });
    applyPlace(t, placed);
    sc.elements.push(t);
    return;
  }
  if (!fill && !visibleStroke && !hasText) return;

  const kind = cust ? 'path' : (SHAPES[prst] ?? 'rect');
  const shape = newShape(kind, placed.x, placed.y, placed.w, placed.h, fill ?? null, { stroke: visibleStroke });
  applyPlace(shape, placed);
  if (cust) {
    const p = customPath(cust);
    if (p) { shape.d = p.d; shape.vb = p.vb; }
    else { shape.shape = 'rect'; c.warnings.push(`Slide ${sc.n}: a custom shape was simplified to a rectangle`); }
  }
  if (kind === 'round-rect') {
    const adjMatch = /val (-?\d+)/.exec((geom ? descendants(geom, 'gd')[0] : undefined)?.getAttribute('fmla') ?? '');
    const adj = adjMatch ? Number(adjMatch[1]) : 16667;
    shape.radius = Math.min(placed.w, placed.h) * Math.min(0.5, adj / 100000);
  } else if (STAR_POINTS[prst]) shape.radius = STAR_POINTS[prst];
  else if (kind !== 'path') delete shape.radius;
  if (text && hasText) {
    shape.doc = text.doc;
    shape.base = text.base;
    shape.pad = text.pad;
    shape.vAlign = text.vAlign;
  }
  sc.elements.push(shape);
}

function pushLine(sc: SlideCtx, sp: Element, placed: Placed, prst: string, stroke: Stroke): void {
  const ln = kid(kid(sp, 'spPr'), 'ln');
  const line: LineEl = applyPlace(newLine(placed.x, placed.y, placed.w, placed.h, { stroke }), placed, false);
  line.up = placed.flipX !== placed.flipY;
  line.curve = prst.startsWith('bent') ? 'elbow' : prst.startsWith('curved') ? 'curve' : 'straight';
  line.start = ARROWS[at(ln, 'headEnd')?.getAttribute('type') ?? ''] ?? 'none';
  line.end = ARROWS[at(ln, 'tailEnd')?.getAttribute('type') ?? ''] ?? 'none';
  sc.elements.push(line);
}

function handleCxn(sc: SlideCtx, cxn: Element, m: M): void {
  const spPr = kid(cxn, 'spPr');
  const xf = readXfrm(kid(spPr, 'xfrm'));
  if (!xf) return;
  const sty = styleColors(sc, cxn);
  const stroke = strokeOfLn(sc.c, kid(spPr, 'ln'), sty.hasLnRef ? sty.line : undefined) ?? strokeOf(sty.line ?? '@text', EMU_PER_PT * sc.c.k);
  pushLine(sc, cxn, place(sc.c.k, m, xf), kid(spPr, 'prstGeom')?.getAttribute('prst') ?? 'line', stroke);
}

function handlePic(sc: SlideCtx, pic: Element, m: M): void {
  const c = sc.c;
  const nvPr = at(pic, 'nvPicPr', 'nvPr');
  if (kid(nvPr, 'videoFile') || kid(nvPr, 'audioFile')) {
    c.warnings.push(`Slide ${sc.n}: ${kid(nvPr, 'videoFile') ? 'a video' : 'audio'} clip was skipped`);
    return;
  }
  const xf = readXfrm(at(pic, 'spPr', 'xfrm'));
  const blip = at(pic, 'blipFill', 'blip');
  const rel = sc.rels.get(blip?.getAttribute('r:embed') ?? '');
  if (!xf || !rel || rel.external) return;
  const meta = addMedia(sc, rel.target);
  if (!meta) return;
  const placed = place(c.k, m, xf);
  const img: ImageEl = applyPlace(newImage(meta.id, 0, 0, 0, 0), placed);
  const src = at(pic, 'blipFill', 'srcRect');
  if (src) {
    const l = attrN(src, 'l') / 100000, t = attrN(src, 't') / 100000, r = attrN(src, 'r') / 100000, b = attrN(src, 'b') / 100000;
    img.crop = { x: l, y: t, w: Math.max(0.01, 1 - l - r), h: Math.max(0.01, 1 - t - b) };
  }
  const descr = at(pic, 'nvPicPr', 'cNvPr')?.getAttribute('descr');
  if (descr) img.alt = descr;
  if (kid(kid(pic, 'spPr'), 'prstGeom')?.getAttribute('prst') === 'ellipse') img.mask = 'ellipse';
  const stroke = strokeOfLn(c, at(pic, 'spPr', 'ln'));
  if (stroke) img.stroke = stroke;
  sc.elements.push(img);
}

function handleTable(sc: SlideCtx, tbl: Element, xf: Xfrm, m: M): void {
  const c = sc.c;
  const placed = place(c.k, m, xf);
  const cols = kids(kid(tbl, 'tblGrid'), 'gridCol').map((g) => attrN(g, 'w') * c.k);
  const trs = kids(tbl, 'tr');
  if (!cols.length || !trs.length) return;
  const rows = trs.map((tr) => attrN(tr, 'h') * c.k);
  const cells = trs.map((tr) =>
    kids(tr, 'tc').slice(0, cols.length).map((tc) => {
      const body = kid(tc, 'txBody');
      const r = descendants(tc, 'rPr')[0] ?? null;
      const cell: TableEl['cells'][number][number] = { t: plainText(body) };
      if (r?.getAttribute('b') === '1') cell.b = true;
      if (r?.getAttribute('i') === '1') cell.i = true;
      const col = colorIn(c, kid(r, 'solidFill'));
      if (col) cell.c = col;
      const fill = fillOf(c, fillChild(kid(tc, 'tcPr')));
      if (fill?.t === 'solid') cell.fill = fill.c;
      const al = ALIGN[at(body, 'p', 'pPr')?.getAttribute('algn') ?? ''];
      if (al) cell.align = al;
      return cell;
    }),
  );
  while (cells.some((r) => r.length < cols.length)) for (const r of cells) while (r.length < cols.length) r.push({ t: '' });
  const size = Math.max(14, Math.round(attrN(descendants(tbl, 'rPr')[0], 'sz', 1800) / 100 * EMU_PER_PT * c.k));
  const el: TableEl = {
    id: uid('e'), type: 'table', x: placed.x, y: placed.y, w: cols.reduce((a, b) => a + b, 0), h: rows.reduce((a, b) => a + b, 0), rot: 0, opacity: 1,
    cols, rows, cells, header: kid(tbl, 'tblPr')?.getAttribute('firstRow') === '1', banded: kid(tbl, 'tblPr')?.getAttribute('bandRow') === '1',
    border: strokeOf('@muted', 2), headerFill: '@primary', bandFill: '@surface', base: textBase(c.ds, 'body', { size, lh: 1.2 }), pad: Math.round(91440 * c.k),
  };
  sc.elements.push(el);
}

function handleFrame(sc: SlideCtx, gf: Element, m: M): void {
  const data = descendants(gf, 'graphicData')[0];
  const uri = data?.getAttribute('uri') ?? '';
  const xf = readXfrm(kid(gf, 'xfrm'));
  const tbl = data ? kid(data, 'tbl') : null;
  if (tbl && xf) return handleTable(sc, tbl, xf, m);
  const what = uri.includes('chart') ? 'a chart' : uri.includes('diagram') ? 'SmartArt' : uri.includes('ole') || kid(data, 'oleObj') ? 'an embedded object' : 'an unsupported object';
  sc.c.warnings.push(`Slide ${sc.n}: ${what} was skipped`);
}

function walk(sc: SlideCtx, container: Element, m: M): void {
  for (const n of kids(container)) {
    switch (n.localName) {
      case 'sp': handleSp(sc, n, m); break;
      case 'pic': handlePic(sc, n, m); break;
      case 'cxnSp': handleCxn(sc, n, m); break;
      case 'graphicFrame': handleFrame(sc, n, m); break;
      case 'grpSp': {
        const xf = readXfrm(at(n, 'grpSpPr', 'xfrm'));
        walk(sc, n, xf ? groupMatrix(m, xf) : m);
        break;
      }
      case 'AlternateContent': {
        // Prefer the fallback: it's the plain-OOXML rendition of what the Choice describes.
        const alt = kid(n, 'Fallback') ?? kid(n, 'Choice');
        if (alt) walk(sc, alt, m);
        break;
      }
    }
  }
}

// ── Slides ───────────────────────────────────────────────────────────────────

function backgroundOf(c: Ctx, doc: Document | null): Fill | null | undefined {
  const bg = doc ? descendants(doc.documentElement, 'bg')[0] : undefined;
  if (!bg) return undefined;
  const bgPr = kid(bg, 'bgPr');
  if (bgPr) return fillOf(c, fillChild(bgPr));
  const ref = kid(bg, 'bgRef');
  const col = colorIn(c, ref);
  return col ? solid(col) : undefined;
}

function importSlide(c: Ctx, path: string, n: number): Slide | null {
  const doc = parseXml(c.files, path);
  if (!doc) {
    c.warnings.push(`Slide ${n}: the slide couldn't be read and was skipped`);
    return null;
  }
  const rels = readRels(c.files, path);
  const layoutRel = relOfType(rels, '/slideLayout');
  const layout = layoutRel ? parseXml(c.files, layoutRel.target) : null;
  const masterRel = layoutRel ? relOfType(readRels(c.files, layoutRel.target), '/slideMaster') : undefined;
  const master = masterRel ? parseXml(c.files, masterRel.target) : parseXml(c.files, 'ppt/slideMasters/slideMaster1.xml');
  const sc: SlideCtx = { c, n, rels, layout, master, elements: [] };

  const root = doc.documentElement;
  const tree = at(root, 'cSld', 'spTree');
  if (tree) walk(sc, tree, IDENTITY);

  const slide = newSlide({ elements: sc.elements });
  slide.background = backgroundOf(c, doc) ?? backgroundOf(c, layout) ?? backgroundOf(c, master) ?? undefined;
  if (slide.background === undefined) delete slide.background;
  if (root.getAttribute('show') === '0') slide.hidden = true;

  const notesRel = relOfType(rels, '/notesSlide');
  const notesDoc = notesRel ? parseXml(c.files, notesRel.target) : null;
  if (notesDoc) {
    slide.notes = descendants(notesDoc.documentElement, 'sp')
      .filter((sp) => at(sp, 'nvSpPr', 'nvPr', 'ph')?.getAttribute('type') === 'body')
      .map((sp) => plainText(kid(sp, 'txBody')))
      .filter(Boolean)
      .join('\n');
  }
  if (kid(root, 'timing')) c.warnings.push(`Slide ${n}: animations were skipped`);
  if (kid(root, 'transition') || descendants(root, 'transition').length) c.warnings.push(`Slide ${n}: the transition was skipped`);
  return slide;
}

export async function importPptx(data: ArrayBuffer | Blob | Uint8Array, theme: DesignSystem, targetSize: { w: number; h: number }): Promise<ImportResult> {
  const bytes = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(await data.arrayBuffer());
  const warnings: string[] = [];
  let total = 0;
  let files: Files;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_UNCOMPRESSED) throw new Error('too large');
        return /^ppt\/|^docProps\/core\.xml$/.test(f.name) && !f.name.includes('..');
      },
    });
  } catch {
    throw new Error("This isn't a PowerPoint file Frames can open.");
  }
  const pres = parseXml(files, 'ppt/presentation.xml');
  if (!pres) throw new Error("This isn't a PowerPoint file Frames can open.");

  const sldSz = descendants(pres.documentElement, 'sldSz')[0];
  const cx = attrN(sldSz, 'cx', 9144000), cy = attrN(sldSz, 'cy', 6858000);
  const k = targetSize.w / cx;
  const { scheme, fonts } = readScheme(files);
  const c: Ctx = { files, k, warnings, assets: new Map(), scheme, clrMap: readClrMap(files), fonts, ds: theme };

  const presRels = readRels(files, 'ppt/presentation.xml');
  const paths = descendants(pres.documentElement, 'sldId')
    .map((s) => presRels.get(s.getAttribute('r:id') ?? '')?.target)
    .filter((p): p is string => !!p);

  const slides: Slide[] = [];
  paths.forEach((p, i) => {
    try {
      const s = importSlide(c, p, i + 1);
      if (s) slides.push(s);
    } catch {
      warnings.push(`Slide ${i + 1}: something unexpected went wrong and the slide was skipped`);
    }
  });
  if (!paths.length) warnings.push('No slides were found in this file');

  const core = parseXml(files, 'docProps/core.xml');
  const title = (core ? descendants(core.documentElement, 'title')[0]?.textContent?.trim() : undefined) || undefined;
  return { slides, assets: [...c.assets.values()], size: { w: targetSize.w, h: Math.round(cy * k) }, warnings, title };
}
