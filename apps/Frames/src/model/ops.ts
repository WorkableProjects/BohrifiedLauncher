import { clone } from './clone';
import { cloneEl, cloneSlide, slideFromLayout } from './defaults';
import { bounds, unionRects, type Rect } from './geometry';
import { uid } from './ids';
import type { Deck, El, GroupEl, ID, Layout, Slide, SlideAnim, StylePreset } from './types';

/**
 * Pure edits on a `Deck`. Each takes the (immer draft of the) deck first, so
 * the same functions serve single commits and live gestures:
 *
 *     doc.commit('Nudge', (d) => ops.moveBy(d, slideId, ids, 10, 0));
 */

export type DeckLike = Deck;

// ── Lookup ───────────────────────────────────────────────────────────────────

export const slideById = (d: Deck, id: ID): Slide | undefined => d.slides.find((s) => s.id === id);
export const slideIndex = (d: Deck, id: ID) => d.slides.findIndex((s) => s.id === id);

/** Depth-first walk over elements (groups before their children). */
export function walk(els: readonly El[], fn: (e: El, parent: GroupEl | null) => void, parent: GroupEl | null = null) {
  for (const e of els) {
    fn(e, parent);
    if (e.type === 'group') walk(e.children, fn, e);
  }
}

export function findEl(els: readonly El[], id: ID): El | undefined {
  for (const e of els) {
    if (e.id === id) return e;
    if (e.type === 'group') {
      const hit = findEl(e.children, id);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** The array that directly contains `id` (the slide's elements, or a group's children). */
export function containerOf(els: El[], id: ID): El[] | undefined {
  if (els.some((e) => e.id === id)) return els;
  for (const e of els) {
    if (e.type === 'group') {
      const hit = containerOf(e.children, id);
      if (hit) return hit;
    }
  }
  return undefined;
}

export function parentOf(els: readonly El[], id: ID): GroupEl | null {
  let found: GroupEl | null = null;
  walk(els, (e, p) => {
    if (e.id === id) found = p;
  });
  return found;
}

/** Absolute (slide-space) frame of an element, accounting for group nesting (ignores group rotation). */
export function absoluteRect(els: readonly El[], id: ID): Rect | null {
  let result: Rect | null = null;
  const go = (list: readonly El[], ox: number, oy: number) => {
    for (const e of list) {
      if (e.id === id) result = { x: e.x + ox, y: e.y + oy, w: e.w, h: e.h };
      if (e.type === 'group') go(e.children, ox + e.x, oy + e.y);
    }
  };
  go(els, 0, 0);
  return result;
}

export function allIds(els: readonly El[]): Set<ID> {
  const out = new Set<ID>();
  walk(els, (e) => out.add(e.id));
  return out;
}

export function assetIdsOf(deck: Deck): Set<ID> {
  const out = new Set<ID>();
  const fill = (f: unknown) => {
    const x = f as { t?: string; asset?: ID } | null | undefined;
    if (x && x.t === 'image' && x.asset) out.add(x.asset);
  };
  const scan = (els: readonly El[]) =>
    walk(els, (e) => {
      if ((e.type === 'image' || e.type === 'video' || e.type === 'audio') && e.asset) out.add(e.asset);
      if (e.type === 'text' || e.type === 'shape') fill((e as { fill?: unknown }).fill);
    });
  for (const s of deck.slides) {
    scan(s.elements);
    fill(s.background);
  }
  scan(deck.master.elements);
  fill(deck.master.background);
  for (const l of deck.layouts) {
    scan(l.elements);
    fill(l.background);
  }
  return out;
}

// ── Slides ───────────────────────────────────────────────────────────────────

export function insertSlides(d: Deck, slides: Slide[], index: number) {
  d.slides.splice(Math.max(0, Math.min(index, d.slides.length)), 0, ...slides);
}

export function addSlideFromLayout(d: Deck, layoutId: ID | undefined, afterId?: ID): Slide {
  const layout = d.layouts.find((l) => l.id === layoutId) ?? d.layouts.find((l) => l.name === 'Title and content') ?? d.layouts[0];
  const slide = layout ? slideFromLayout(layout) : ({ id: uid('s'), elements: [], notes: '', transition: null, anims: [] } as Slide);
  const at = afterId ? slideIndex(d, afterId) + 1 : d.slides.length;
  d.slides.splice(at, 0, slide);
  return slide;
}

export function duplicateSlides(d: Deck, ids: ID[]): Slide[] {
  const picks = d.slides.filter((s) => ids.includes(s.id));
  if (!picks.length) return [];
  const copies = picks.map((s) => cloneSlide(clone(s)));
  const last = Math.max(...picks.map((s) => slideIndex(d, s.id)));
  d.slides.splice(last + 1, 0, ...copies);
  return copies;
}

export function deleteSlides(d: Deck, ids: ID[]) {
  d.slides = d.slides.filter((s) => !ids.includes(s.id));
}

/** Move slides (kept in their current order) so they start at `toIndex` of the deck without them. */
export function moveSlides(d: Deck, ids: ID[], toIndex: number) {
  const moving = d.slides.filter((s) => ids.includes(s.id));
  const rest = d.slides.filter((s) => !ids.includes(s.id));
  rest.splice(Math.max(0, Math.min(toIndex, rest.length)), 0, ...moving);
  d.slides = rest;
}

export function patchSlide(d: Deck, id: ID, patch: Partial<Slide> | ((s: Slide) => void)) {
  const s = slideById(d, id);
  if (!s) return;
  if (typeof patch === 'function') patch(s);
  else Object.assign(s, patch);
}

// ── Elements ─────────────────────────────────────────────────────────────────

export function addElements(d: Deck, slideId: ID, els: El[], index?: number) {
  const s = slideById(d, slideId);
  if (!s) return;
  if (index === undefined) s.elements.push(...els);
  else s.elements.splice(index, 0, ...els);
}

export function patchElement(d: Deck, slideId: ID, id: ID, patch: Partial<El> | ((e: El) => void)) {
  const s = slideById(d, slideId);
  const e = s && findEl(s.elements, id);
  if (!e) return;
  if (typeof patch === 'function') patch(e);
  else Object.assign(e, patch);
}

export function patchElements(d: Deck, slideId: ID, ids: ID[], patch: Partial<El> | ((e: El) => void)) {
  for (const id of ids) patchElement(d, slideId, id, patch);
}

export function removeAnimsFor(s: Slide, ids: Set<ID>) {
  s.anims = s.anims.filter((a) => !ids.has(a.el));
}

export function deleteElements(d: Deck, slideId: ID, ids: ID[]) {
  const s = slideById(d, slideId);
  if (!s) return;
  const gone = new Set<ID>();
  for (const id of ids) {
    const box = containerOf(s.elements, id);
    if (!box) continue;
    const i = box.findIndex((e) => e.id === id);
    const [removed] = box.splice(i, 1);
    if (removed) walk([removed], (e) => gone.add(e.id));
  }
  removeAnimsFor(s, gone);
}

export type ArrangeMode = 'front' | 'back' | 'forward' | 'backward';

export function reorder(d: Deck, slideId: ID, ids: ID[], mode: ArrangeMode) {
  const s = slideById(d, slideId);
  if (!s) return;
  // Only top-level / same-container ordering: group by container.
  const containers = new Map<El[], ID[]>();
  for (const id of ids) {
    const box = containerOf(s.elements, id);
    if (box) containers.set(box, [...(containers.get(box) ?? []), id]);
  }
  for (const [box, group] of containers) {
    const set = new Set(group);
    const picked = box.filter((e) => set.has(e.id));
    if (mode === 'front' || mode === 'back') {
      const rest = box.filter((e) => !set.has(e.id));
      const next = mode === 'front' ? [...rest, ...picked] : [...picked, ...rest];
      box.splice(0, box.length, ...next);
    } else if (mode === 'forward') {
      for (let i = box.length - 2; i >= 0; i--) {
        if (set.has(box[i]!.id) && !set.has(box[i + 1]!.id)) [box[i], box[i + 1]] = [box[i + 1]!, box[i]!];
      }
    } else {
      for (let i = 1; i < box.length; i++) {
        if (set.has(box[i]!.id) && !set.has(box[i - 1]!.id)) [box[i], box[i - 1]] = [box[i - 1]!, box[i]!];
      }
    }
  }
}

/** Move one element to an exact z-index within its container (layers panel drag). */
export function moveToIndex(d: Deck, slideId: ID, id: ID, index: number) {
  const s = slideById(d, slideId);
  const box = s && containerOf(s.elements, id);
  if (!box) return;
  const from = box.findIndex((e) => e.id === id);
  const [el] = box.splice(from, 1);
  if (el) box.splice(Math.max(0, Math.min(index, box.length)), 0, el);
}

export function moveBy(d: Deck, slideId: ID, ids: ID[], dx: number, dy: number) {
  patchElements(d, slideId, ids, (e) => {
    e.x += dx;
    e.y += dy;
  });
}

// ── Group / ungroup ──────────────────────────────────────────────────────────

export function groupElements(d: Deck, slideId: ID, ids: ID[]): GroupEl | null {
  const s = slideById(d, slideId);
  if (!s || ids.length < 2) return null;
  // Group only top-level siblings of the first pick.
  const box = containerOf(s.elements, ids[0]!);
  if (!box) return null;
  const members = box.filter((e) => ids.includes(e.id));
  if (members.length < 2) return null;
  const r = unionRects(members.map((e) => bounds(e)))!;
  const first = box.findIndex((e) => e.id === members[0]!.id);
  const children = members.map((e) => ({ ...clone(e), x: e.x - r.x, y: e.y - r.y }) as El);
  const group: GroupEl = { id: uid('e'), type: 'group', x: r.x, y: r.y, w: r.w, h: r.h, rot: 0, opacity: 1, children, name: 'Group' };
  const set = new Set(members.map((m) => m.id));
  const rest = box.filter((e) => !set.has(e.id));
  rest.splice(Math.min(first, rest.length), 0, group);
  box.splice(0, box.length, ...rest);
  return group;
}

export function ungroupElements(d: Deck, slideId: ID, ids: ID[]): ID[] {
  const s = slideById(d, slideId);
  if (!s) return [];
  const out: ID[] = [];
  for (const id of ids) {
    const box = containerOf(s.elements, id);
    const g = box?.find((e) => e.id === id);
    if (!box || !g || g.type !== 'group') continue;
    const i = box.indexOf(g);
    const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
    const released = g.children.map((c) => {
      const kid = clone(c) as El;
      // Bake the group's rotation into the children's centres.
      const ccx = g.x + c.x + c.w / 2, ccy = g.y + c.y + c.h / 2;
      if (g.rot) {
        const r = (g.rot * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
        const nx = cx + (ccx - cx) * cos - (ccy - cy) * sin;
        const ny = cy + (ccx - cx) * sin + (ccy - cy) * cos;
        kid.x = nx - c.w / 2;
        kid.y = ny - c.h / 2;
        kid.rot = c.rot + g.rot;
      } else {
        kid.x = g.x + c.x;
        kid.y = g.y + c.y;
      }
      kid.opacity = c.opacity * g.opacity;
      return kid;
    });
    box.splice(i, 1, ...released);
    released.forEach((r) => out.push(r.id));
    // Animations on the group go with it.
    s.anims = s.anims.filter((a) => a.el !== id);
  }
  return out;
}

// ── Align & distribute ───────────────────────────────────────────────────────

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export function alignElements(d: Deck, slideId: ID, ids: ID[], mode: AlignMode, to: 'selection' | 'slide' = ids.length > 1 ? 'selection' : 'slide') {
  const s = slideById(d, slideId);
  if (!s) return;
  const els = ids.map((id) => findEl(s.elements, id)).filter((e): e is El => !!e);
  if (!els.length) return;
  const frame: Rect = to === 'slide' ? { x: 0, y: 0, w: d.size.w, h: d.size.h } : unionRects(els.map((e) => bounds(e)))!;
  for (const e of els) {
    const b = bounds(e);
    let dx = 0, dy = 0;
    if (mode === 'left') dx = frame.x - b.x;
    if (mode === 'center') dx = frame.x + frame.w / 2 - (b.x + b.w / 2);
    if (mode === 'right') dx = frame.x + frame.w - (b.x + b.w);
    if (mode === 'top') dy = frame.y - b.y;
    if (mode === 'middle') dy = frame.y + frame.h / 2 - (b.y + b.h / 2);
    if (mode === 'bottom') dy = frame.y + frame.h - (b.y + b.h);
    e.x += dx;
    e.y += dy;
  }
}

/** Space elements so the gaps between them are equal (needs 3+). */
export function distributeElements(d: Deck, slideId: ID, ids: ID[], axis: 'h' | 'v') {
  const s = slideById(d, slideId);
  if (!s) return;
  const els = ids.map((id) => findEl(s.elements, id)).filter((e): e is El => !!e);
  if (els.length < 3) return;
  const key = axis === 'h' ? 'x' : 'y', size = axis === 'h' ? 'w' : 'h';
  const sorted = [...els].sort((a, b) => bounds(a)[key] - bounds(b)[key]);
  const first = bounds(sorted[0]!), last = bounds(sorted[sorted.length - 1]!);
  const total = last[key] + last[size] - first[key];
  const used = sorted.reduce((sum, e) => sum + bounds(e)[size], 0);
  const gap = (total - used) / (sorted.length - 1);
  let cursor = first[key];
  for (const e of sorted) {
    const b = bounds(e);
    e[key] += cursor - b[key];
    cursor += b[size] + gap;
  }
}

// ── Images ───────────────────────────────────────────────────────────────────

/**
 * Swap an image's asset while keeping its box: the new picture covers the
 * same frame (cropped, not stretched), so the layout survives.
 */
export function replaceImageAsset(d: Deck, slideId: ID, id: ID, asset: ID, natural?: { w: number; h: number }) {
  patchElement(d, slideId, id, (e) => {
    if (e.type !== 'image' && e.type !== 'video') return;
    e.asset = asset;
    if (natural && natural.w > 0 && natural.h > 0) e.crop = coverCrop(e.w, e.h, natural.w, natural.h);
  });
}

/** Centered crop (fractions of the source) that fills a box of `w`×`h` with a `nw`×`nh` image. */
export function coverCrop(w: number, h: number, nw: number, nh: number) {
  const boxAspect = w / Math.max(1, h), imgAspect = nw / Math.max(1, nh);
  if (imgAspect > boxAspect) {
    const cw = boxAspect / imgAspect;
    return { x: (1 - cw) / 2, y: 0, w: cw, h: 1 };
  }
  const ch = imgAspect / boxAspect;
  return { x: 0, y: (1 - ch) / 2, w: 1, h: ch };
}

// ── Animations ───────────────────────────────────────────────────────────────

export function addAnim(d: Deck, slideId: ID, anim: SlideAnim, index?: number) {
  const s = slideById(d, slideId);
  if (!s) return;
  if (index === undefined) s.anims.push(anim);
  else s.anims.splice(index, 0, anim);
}

export function patchAnim(d: Deck, slideId: ID, animId: ID, patch: Partial<SlideAnim> | ((a: SlideAnim) => void)) {
  const s = slideById(d, slideId);
  const a = s?.anims.find((x) => x.id === animId);
  if (!a) return;
  if (typeof patch === 'function') patch(a);
  else Object.assign(a, patch);
}

export function removeAnim(d: Deck, slideId: ID, animIds: ID[]) {
  const s = slideById(d, slideId);
  if (s) s.anims = s.anims.filter((a) => !animIds.includes(a.id));
}

export function moveAnim(d: Deck, slideId: ID, animId: ID, toIndex: number) {
  const s = slideById(d, slideId);
  if (!s) return;
  const from = s.anims.findIndex((a) => a.id === animId);
  if (from < 0) return;
  const [a] = s.anims.splice(from, 1);
  if (a) s.anims.splice(Math.max(0, Math.min(toIndex, s.anims.length)), 0, a);
}

// ── Layouts, styles, theme ───────────────────────────────────────────────────

export function addLayout(d: Deck, layout: Layout) {
  d.layouts.push(layout);
}

/** Switch a slide to another layout: placeholders keep their content, missing ones are added. */
export function applyLayout(d: Deck, slideId: ID, layoutId: ID) {
  const s = slideById(d, slideId);
  const layout = d.layouts.find((l) => l.id === layoutId);
  if (!s || !layout) return;
  s.layout = layoutId;
  const free = s.elements.filter((e) => e.ph);
  const used = new Set<ID>();
  for (const spec of layout.elements.filter((e) => e.ph)) {
    const match = free.find((e) => e.ph === spec.ph && !used.has(e.id));
    if (match) {
      used.add(match.id);
      match.x = spec.x;
      match.y = spec.y;
      match.w = spec.w;
      match.h = spec.h;
      if (match.type === 'text' && spec.type === 'text') match.base = clone(spec.base);
    } else {
      const c = cloneEl(spec);
      if (c.type === 'text') c.doc = [{ runs: [{ t: '' }] }];
      s.elements.unshift(c);
    }
  }
}

export function addStyle(d: Deck, style: StylePreset) {
  d.styles.push(style);
}

/** Renumber the ids of a slide's content (used when pasting a slide from elsewhere). */
export const freshSlide = (s: Slide) => cloneSlide(s);
