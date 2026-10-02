import { toHex } from '../model/color';
import { resolveColor, resolveFont } from '../model/theme';
import type { Align, DesignSystem, Para, RichDoc, Run, TextBase } from '../model/types';

/**
 * Rich-text editing on a contenteditable overlay. The model (`RichDoc`) is
 * the source of truth: it is rendered to DOM when editing starts and parsed
 * back on every change. Inline formatting uses the browser's own selection
 * handling (execCommand) with a "marker" trick to get arbitrary styles.
 */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function runStyle(r: Run, theme: DesignSystem, base: TextBase): string {
  const css: string[] = [];
  const weight = r.w ?? (r.b ? Math.max(700, base.weight) : undefined);
  if (weight) css.push(`font-weight:${weight}`);
  if (r.i) css.push('font-style:italic');
  if (r.c) css.push(`color:${resolveColor(theme, r.c)}`);
  if (r.hl) css.push(`background-color:${resolveColor(theme, r.hl)}`);
  if (r.size) css.push(`font-size:${r.size}px`);
  if (r.font) css.push(`font-family:${resolveFont(theme, r.font)}`);
  if (r.ls !== undefined) css.push(`letter-spacing:${r.ls}px`);
  if (r.o !== undefined && r.o < 1) css.push(`opacity:${r.o}`);
  const deco = [r.u ? 'underline' : '', r.s ? 'line-through' : ''].filter(Boolean).join(' ');
  if (deco) css.push(`text-decoration:${deco}`);
  return css.join(';');
}

function runHtml(r: Run, theme: DesignSystem, base: TextBase): string {
  const inner = esc(r.t);
  const attrs: string[] = [];
  const st = runStyle(r, theme, base);
  if (st) attrs.push(`style="${st}"`);
  if (r.c) attrs.push(`data-c="${esc(r.c)}"`);
  if (r.hl) attrs.push(`data-hl="${esc(r.hl)}"`);
  if (r.font) attrs.push(`data-font="${esc(r.font)}"`);
  let html = `<span${attrs.length ? ' ' + attrs.join(' ') : ''}>${inner}</span>`;
  if (r.sup) html = `<sup>${html}</sup>`;
  if (r.sub) html = `<sub>${html}</sub>`;
  if (r.link) html = `<a href="${esc(r.link)}">${html}</a>`;
  return html;
}

export function paraHtml(p: Para, theme: DesignSystem, base: TextBase, num?: number): string {
  const css: string[] = [];
  if (p.align) css.push(`text-align:${p.align}`);
  if (p.lh) css.push(`line-height:${p.lh}`);
  if (p.before) css.push(`margin-top:${p.before}px`);
  if (p.after) css.push(`margin-bottom:${p.after}px`);
  const attrs = [`class="p"`];
  if (p.list) attrs.push(`data-list="${p.list}"`, `data-level="${p.level ?? 0}"`);
  if (num !== undefined) attrs.push(`data-num="${num}"`);
  if (css.length) attrs.push(`style="${css.join(';')}"`);
  const body = p.runs.map((r) => runHtml(r, theme, base)).join('') || '<br>';
  return `<div ${attrs.join(' ')}>${body}</div>`;
}

export function docToHtml(doc: RichDoc, theme: DesignSystem, base: TextBase): string {
  const counters: number[] = [];
  return doc
    .map((p) => {
      let num: number | undefined;
      if (p.list === 'number') {
        const lv = p.level ?? 0;
        counters.length = lv + 1;
        counters[lv] = (counters[lv] ?? 0) + 1;
        num = counters[lv];
      } else if (!p.list) counters.length = 0;
      return paraHtml(p, theme, base, num);
    })
    .join('');
}

/** Number the ordered-list items in the DOM (the CSS shows `data-num`). */
export function renumber(root: HTMLElement) {
  const counters: number[] = [];
  for (const el of Array.from(root.children) as HTMLElement[]) {
    const kind = el.dataset.list;
    const lv = Number(el.dataset.level ?? 0);
    if (kind === 'number') {
      counters.length = lv + 1;
      counters[lv] = (counters[lv] ?? 0) + 1;
      el.dataset.num = String(counters[lv]);
    } else {
      delete el.dataset.num;
      if (!kind) counters.length = 0;
    }
  }
}

// ── Parsing ──────────────────────────────────────────────────────────────────

interface Ctx {
  b?: boolean; i?: boolean; u?: boolean; s?: boolean; sup?: boolean; sub?: boolean;
  c?: string; hl?: string; size?: number; font?: string; w?: number; ls?: number; o?: number; link?: string;
}

function cssColor(v: string): string | undefined {
  if (!v || v === 'transparent' || v === 'rgba(0, 0, 0, 0)') return undefined;
  const m = /rgba?\(([^)]+)\)/.exec(v);
  if (m) {
    const [r, g, b, a] = m[1]!.split(',').map((x) => parseFloat(x));
    const hex = '#' + [r, g, b].map((n) => Math.round(n ?? 0).toString(16).padStart(2, '0')).join('');
    return a !== undefined && a < 1 ? hex + Math.round(a * 255).toString(16).padStart(2, '0') : hex;
  }
  return v;
}

function readStyle(el: HTMLElement, base: Ctx, baseText: TextBase, theme: DesignSystem): Ctx {
  const c: Ctx = { ...base };
  switch (el.tagName) {
    case 'B': case 'STRONG': c.b = true; break;
    case 'I': case 'EM': c.i = true; break;
    case 'U': c.u = true; break;
    case 'S': case 'STRIKE': case 'DEL': c.s = true; break;
    case 'SUP': c.sup = true; c.sub = false; break;
    case 'SUB': c.sub = true; c.sup = false; break;
    case 'A': c.link = el.getAttribute('href') ?? undefined; break;
    case 'FONT': {
      const col = el.getAttribute('color');
      if (col) c.c = col;
      const face = el.getAttribute('face');
      if (face) c.font = face;
      break;
    }
    default:
  }
  const st = el.style;
  if (st) {
    if (st.fontWeight) {
      const w = st.fontWeight === 'bold' ? 700 : st.fontWeight === 'normal' ? 400 : parseInt(st.fontWeight, 10);
      if (Number.isFinite(w)) {
        c.w = w;
        c.b = w >= 600;
        if (w === baseText.weight) c.w = undefined;
      }
    }
    if (st.fontStyle) c.i = st.fontStyle === 'italic';
    const deco = st.textDecorationLine || st.textDecoration;
    if (deco) {
      c.u = /underline/.test(deco) || (deco.includes('none') ? false : c.u);
      c.s = /line-through/.test(deco) || (deco.includes('none') ? false : c.s);
    }
    if (st.color) c.c = el.dataset.c ?? cssColor(st.color);
    if (st.backgroundColor) c.hl = el.dataset.hl ?? cssColor(st.backgroundColor);
    if (st.fontSize && st.fontSize.endsWith('px')) c.size = parseFloat(st.fontSize);
    if (st.fontFamily) c.font = el.dataset.font ?? st.fontFamily.replace(/^["']|["']$/g, '');
    if (st.letterSpacing && st.letterSpacing.endsWith('px')) c.ls = parseFloat(st.letterSpacing);
    if (st.opacity) c.o = parseFloat(st.opacity);
    if (st.verticalAlign === 'super') { c.sup = true; c.sub = false; }
    if (st.verticalAlign === 'sub') { c.sub = true; c.sup = false; }
  }
  void theme;
  return c;
}

function toRun(text: string, c: Ctx, base: TextBase, theme: DesignSystem): Run {
  const r: Run = { t: text };
  if (c.b && !c.w) r.b = true;
  if (c.w) r.w = c.w;
  if (c.i) r.i = true;
  if (c.u) r.u = true;
  if (c.s) r.s = true;
  if (c.sup) r.sup = true;
  if (c.sub) r.sub = true;
  // Drop values equal to the element's defaults so documents stay minimal.
  if (c.c && toHex(c.c[0] === '@' ? resolveColor(theme, c.c) : c.c) !== toHex(resolveColor(theme, base.color))) r.c = c.c;
  if (c.hl) r.hl = c.hl;
  if (c.size && Math.abs(c.size - base.size) > 0.01) r.size = Math.round(c.size * 10) / 10;
  if (c.font && c.font !== base.font && resolveFont(theme, c.font) !== resolveFont(theme, base.font)) r.font = c.font;
  if (c.ls !== undefined && Math.abs(c.ls - base.ls) > 0.01) r.ls = c.ls;
  if (c.o !== undefined && c.o < 1) r.o = c.o;
  if (c.link) r.link = c.link;
  return r;
}

const BLOCK = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'UL', 'OL', 'BLOCKQUOTE']);

export function htmlToDoc(root: HTMLElement, base: TextBase, theme: DesignSystem): RichDoc {
  const out: Para[] = [];
  let cur: Para | null = null;
  const start = (el?: HTMLElement) => {
    const p: Para = { runs: [] };
    if (el) {
      const align = el.style?.textAlign as Align | '';
      if (align) p.align = align === ('start' as string) ? 'left' : align;
      if (el.dataset?.list === 'bullet' || el.dataset?.list === 'number') {
        p.list = el.dataset.list;
        p.level = Number(el.dataset.level ?? 0);
      } else if (el.tagName === 'LI') p.list = el.parentElement?.tagName === 'OL' ? 'number' : 'bullet';
      const lh = parseFloat(el.style?.lineHeight ?? '');
      if (Number.isFinite(lh) && lh > 0 && !el.style.lineHeight.endsWith('px')) p.lh = lh;
      const mt = parseFloat(el.style?.marginTop ?? '');
      if (Number.isFinite(mt) && mt > 0) p.before = mt;
      const mb = parseFloat(el.style?.marginBottom ?? '');
      if (Number.isFinite(mb) && mb > 0) p.after = mb;
    }
    out.push(p);
    cur = p;
    return p;
  };
  const push = (text: string, c: Ctx) => {
    if (!text) return;
    if (!cur) start();
    const r = toRun(text, c, base, theme);
    const last = cur!.runs[cur!.runs.length - 1];
    if (last && JSON.stringify({ ...last, t: '' }) === JSON.stringify({ ...r, t: '' })) last.t += text;
    else cur!.runs.push(r);
  };
  const walk = (node: Node, c: Ctx) => {
    if (node.nodeType === Node.TEXT_NODE) return push((node.textContent ?? '').replace(/[​\r]/g, '').replace(/\n/g, ' '), c);
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (el.tagName === 'BR') {
      // A <br> that is the only thing in a block is just the empty line's placeholder.
      if (el.parentElement && el.parentElement.childNodes.length === 1 && BLOCK.has(el.parentElement.tagName)) return;
      return void start();
    }
    if (BLOCK.has(el.tagName)) {
      if (el.tagName === 'UL' || el.tagName === 'OL') return void el.childNodes.forEach((ch) => walk(ch, c));
      const hasBlockKid = Array.from(el.children).some((k) => BLOCK.has(k.tagName));
      if (hasBlockKid) return void el.childNodes.forEach((ch) => walk(ch, readStyle(el, c, base, theme)));
      start(el);
      el.childNodes.forEach((ch) => walk(ch, readStyle(el, c, base, theme)));
      return;
    }
    el.childNodes.forEach((ch) => walk(ch, readStyle(el, c, base, theme)));
  };
  root.childNodes.forEach((n) => walk(n, {}));
  if (!out.length) out.push({ runs: [] });
  for (const p of out) if (p.runs.length === 0) p.runs = [{ t: '' }];
  return out;
}

// ── Formatting the selection ─────────────────────────────────────────────────

export interface InlinePatch {
  b?: boolean; i?: boolean; u?: boolean; s?: boolean; sup?: boolean; sub?: boolean;
  c?: string; hl?: string | null; size?: number; font?: string; w?: number; ls?: number; o?: number;
}

function exec(cmd: string, value?: string) {
  document.execCommand(cmd, false, value);
}

let lastRange: Range | null = null;

/** Remember the selection inside `root` so toolbar controls that take focus can still format it. */
export function trackSelection(root: HTMLElement): () => void {
  const on = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && root.contains(sel.getRangeAt(0).commonAncestorContainer)) lastRange = sel.getRangeAt(0).cloneRange();
  };
  document.addEventListener('selectionchange', on);
  return () => {
    document.removeEventListener('selectionchange', on);
    lastRange = null;
  };
}

function restoreRange(root: HTMLElement) {
  root.focus({ preventScroll: true });
  const sel = window.getSelection();
  if (lastRange && sel && !(sel.rangeCount && root.contains(sel.getRangeAt(0).commonAncestorContainer))) {
    sel.removeAllRanges();
    sel.addRange(lastRange);
  }
}

function selectionIn(root: HTMLElement): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  return root.contains(r.commonAncestorContainer) ? r : null;
}

/** Selects the paragraph containing a collapsed caret, so formatting has something to act on. */
function expandCaret(root: HTMLElement) {
  const sel = window.getSelection();
  const r = selectionIn(root);
  if (!sel || !r || !r.collapsed) return;
  let n: Node | null = r.startContainer;
  while (n && n.parentNode !== root) n = n.parentNode;
  if (n) {
    const nr = document.createRange();
    nr.selectNodeContents(n);
    sel.removeAllRanges();
    sel.addRange(nr);
  }
}

export function applyInline(root: HTMLElement, patch: InlinePatch) {
  restoreRange(root);
  exec('styleWithCSS', 'false');
  const toggles: [keyof InlinePatch, string, string?][] = [['b', 'bold'], ['i', 'italic'], ['u', 'underline'], ['s', 'strikeThrough'], ['sup', 'superscript'], ['sub', 'subscript']];
  for (const [k, cmd] of toggles) {
    if (patch[k] === undefined) continue;
    if (document.queryCommandState(cmd) !== patch[k]) exec(cmd);
  }
  const styled: Record<string, string> = {};
  if (patch.c !== undefined) styled.color = patch.c;
  if (patch.hl !== undefined) styled.hl = patch.hl ?? '';
  if (patch.size !== undefined) styled.size = `${patch.size}px`;
  if (patch.font !== undefined) styled.font = patch.font;
  if (patch.w !== undefined) styled.weight = String(patch.w);
  if (patch.ls !== undefined) styled.ls = `${patch.ls}px`;
  if (patch.o !== undefined) styled.o = String(patch.o);
  if (Object.keys(styled).length) {
    expandCaret(root);
    exec('fontSize', '7');
    root.querySelectorAll('font[size="7"]').forEach((f) => {
      const span = document.createElement('span');
      while (f.firstChild) span.appendChild(f.firstChild);
      if (styled.color) {
        span.dataset.c = styled.color;
        span.style.color = '';
      }
      f.replaceWith(span);
      applyStyled(span, styled);
    });
  }
  root.dispatchEvent(new Event('input', { bubbles: true }));
}

let themeForStyles: DesignSystem | null = null;
export const setStyleTheme = (t: DesignSystem) => (themeForStyles = t);

function applyStyled(span: HTMLElement, s: Record<string, string>) {
  const theme = themeForStyles;
  if (s.color && theme) {
    span.dataset.c = s.color;
    span.style.color = resolveColor(theme, s.color);
  }
  if ('hl' in s) {
    if (s.hl && theme) {
      span.dataset.hl = s.hl;
      span.style.backgroundColor = resolveColor(theme, s.hl);
    } else span.style.backgroundColor = 'transparent';
  }
  if (s.size) span.style.fontSize = s.size;
  if (s.font && theme) {
    span.dataset.font = s.font;
    span.style.fontFamily = resolveFont(theme, s.font);
  }
  if (s.weight) span.style.fontWeight = s.weight;
  if (s.ls) span.style.letterSpacing = s.ls;
  if (s.o) span.style.opacity = s.o;
}

export function applyLink(root: HTMLElement, url: string | null) {
  restoreRange(root);
  if (url) exec('createLink', url);
  else exec('unlink');
  root.dispatchEvent(new Event('input', { bubbles: true }));
}

/** The blocks (paragraphs) touched by the selection. */
function selectedBlocks(root: HTMLElement): HTMLElement[] {
  const r = selectionIn(root);
  const kids = Array.from(root.children) as HTMLElement[];
  if (!r) return kids;
  return kids.filter((k) => r.intersectsNode(k) || k.contains(r.startContainer));
}

export function applyBlock(root: HTMLElement, patch: { align?: Align; list?: 'bullet' | 'number' | null; level?: number; lh?: number; before?: number; after?: number }) {
  restoreRange(root);
  for (const el of selectedBlocks(root)) {
    if (patch.align) el.style.textAlign = patch.align;
    if (patch.lh !== undefined) el.style.lineHeight = String(patch.lh);
    if (patch.before !== undefined) el.style.marginTop = `${patch.before}px`;
    if (patch.after !== undefined) el.style.marginBottom = `${patch.after}px`;
    if (patch.list !== undefined) {
      if (patch.list === null || el.dataset.list === patch.list) {
        delete el.dataset.list;
        delete el.dataset.level;
      } else {
        el.dataset.list = patch.list;
        el.dataset.level ??= '0';
      }
    }
    if (patch.level !== undefined && el.dataset.list) el.dataset.level = String(Math.max(0, Math.min(4, Number(el.dataset.level ?? 0) + patch.level)));
  }
  renumber(root);
  root.dispatchEvent(new Event('input', { bubbles: true }));
}

export interface FormatState {
  b: boolean; i: boolean; u: boolean; s: boolean; sup: boolean; sub: boolean;
  size: number; color: string; font: string; align: Align; list: 'bullet' | 'number' | null;
  weight: number;
}

/** Formatting at the caret / start of selection, for the toolbar. */
export function readFormat(root: HTMLElement): FormatState | null {
  const r = selectionIn(root);
  if (!r) return null;
  let n: Node | null = r.startContainer;
  if (n.nodeType === Node.TEXT_NODE) n = n.parentElement;
  const el = n as HTMLElement | null;
  if (!el) return null;
  const cs = getComputedStyle(el);
  const block = (() => {
    let b: HTMLElement | null = el;
    while (b && b.parentElement !== root) b = b.parentElement;
    return b;
  })();
  const q = (c: string) => {
    try { return document.queryCommandState(c); } catch { return false; }
  };
  return {
    b: parseInt(cs.fontWeight, 10) >= 600 || q('bold'),
    i: cs.fontStyle === 'italic',
    u: q('underline'),
    s: q('strikeThrough'),
    sup: q('superscript'),
    sub: q('subscript'),
    size: parseFloat(cs.fontSize),
    color: cs.color,
    font: cs.fontFamily,
    weight: parseInt(cs.fontWeight, 10) || 400,
    align: (block?.style.textAlign || cs.textAlign || 'left') as Align,
    list: (block?.dataset.list as 'bullet' | 'number' | undefined) ?? null,
  };
}
