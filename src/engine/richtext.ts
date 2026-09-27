import type { TextMarks, TextSpan } from './types';

/**
 * Rich text for text boxes and sticky notes.
 *
 * Content is a flat list of spans (runs of text sharing the same marks);
 * '\n' inside span text breaks paragraphs. `TextElement.text` keeps the
 * plain-text mirror, so anything that only needs the words (search, paste,
 * older readers) never has to understand formatting.
 *
 * Adding a format later (strikethrough, code, color, size, links…) means
 * adding a field to `TextMarks`, an entry in `MARKS`, and — if it changes
 * glyph metrics — handling it in `fontFor`. Paragraph-level formats
 * (alignment, lists) would add a sibling block model without touching spans.
 */

export type MarkKey = keyof TextMarks;

export interface MarkSpec {
  key: MarkKey;
  /** Tags that imply the mark when reading editor HTML. */
  tags: string[];
  /** Tag written for the mark when producing editor HTML. */
  tag: string;
  /** Does an element's inline style turn the mark on (true) / off (false)? */
  fromStyle?: (s: CSSStyleDeclaration) => boolean | undefined;
}

export const MARKS: MarkSpec[] = [
  {
    key: 'bold',
    tags: ['B', 'STRONG'],
    tag: 'b',
    fromStyle: (s) => {
      const w = s.fontWeight;
      if (!w) return undefined;
      if (w === 'bold' || w === 'bolder' || +w >= 600) return true;
      if (w === 'normal' || w === 'lighter' || +w < 600) return false;
      return undefined;
    },
  },
  {
    key: 'italic',
    tags: ['I', 'EM'],
    tag: 'i',
    fromStyle: (s) => (s.fontStyle ? s.fontStyle === 'italic' || s.fontStyle === 'oblique' : undefined),
  },
  {
    key: 'underline',
    tags: ['U', 'INS'],
    tag: 'u',
    fromStyle: (s) => {
      const d = s.textDecorationLine || s.textDecoration;
      if (!d) return undefined;
      return d.includes('underline') ? true : d === 'none' ? false : undefined;
    },
  },
];

// ─── Span helpers ─────────────────────────────────────────────────────

/** Marks with falsy entries dropped; undefined when nothing is set. */
export function cleanMarks(m: TextMarks | undefined): TextMarks | undefined {
  if (!m) return undefined;
  const out: TextMarks = {};
  let any = false;
  for (const spec of MARKS) {
    if (m[spec.key]) {
      out[spec.key] = true;
      any = true;
    }
  }
  return any ? out : undefined;
}

export function sameMarks(a: TextMarks | undefined, b: TextMarks | undefined) {
  return MARKS.every((spec) => !!a?.[spec.key] === !!b?.[spec.key]);
}

/** Merge neighbours with equal marks, drop empty runs and unset marks. */
export function normalizeSpans(spans: TextSpan[]): TextSpan[] {
  const out: TextSpan[] = [];
  for (const s of spans) {
    if (!s.text) continue;
    const marks = cleanMarks(s.marks);
    const last = out[out.length - 1];
    if (last && sameMarks(last.marks, marks)) last.text += s.text;
    else out.push(marks ? { text: s.text, marks } : { text: s.text });
  }
  return out;
}

export const plainText = (spans: TextSpan[]) => spans.map((s) => s.text).join('');

export const hasFormatting = (spans: TextSpan[]) => spans.some((s) => cleanMarks(s.marks) && s.text.trim());

/** The spans of a text element (plain text is one unmarked span). */
export const spansOf = (el: { text: string; spans?: TextSpan[] }): TextSpan[] => el.spans ?? [{ text: el.text }];

/** Drop trailing whitespace (and trailing empty lines) across span boundaries. */
export function trimEndSpans(spans: TextSpan[]): TextSpan[] {
  const out = spans.map((s) => ({ ...s }));
  while (out.length) {
    const last = out[out.length - 1];
    last.text = last.text.replace(/\s+$/, '');
    if (last.text) break;
    out.pop();
  }
  return normalizeSpans(out);
}

/** Split into lines on '\n'; every line has at least one (possibly empty) run. */
export function splitLines(spans: TextSpan[]): TextSpan[][] {
  const lines: TextSpan[][] = [[]];
  for (const s of spans) {
    const parts = s.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, marks: s.marks });
    });
  }
  return lines;
}

/** Is `key` on for every visible character? */
export function markIsOn(spans: TextSpan[], key: MarkKey): boolean {
  const visible = spans.filter((s) => s.text.trim());
  return visible.length > 0 && visible.every((s) => !!s.marks?.[key]);
}

/** Set a mark on (or off) for every character. */
export function setMark(spans: TextSpan[], key: MarkKey, on: boolean): TextSpan[] {
  return normalizeSpans(spans.map((s) => ({ text: s.text, marks: { ...s.marks, [key]: on } })));
}

/** Whole-element toggle: on everywhere unless it already is, then off everywhere. */
export const toggleMark = (spans: TextSpan[], key: MarkKey) => setMark(spans, key, !markIsOn(spans, key));

/** Fields for a TextElement from edited spans: plain mirror + spans only when formatted. */
export function textFields(spans: TextSpan[]): { text: string; spans?: TextSpan[] } {
  const clean = normalizeSpans(spans);
  return hasFormatting(clean) ? { text: plainText(clean), spans: clean } : { text: plainText(clean) };
}

/** A copy of a text element carrying new content (dropping `spans` when unformatted). */
export function withSpans<T extends { text: string; spans?: TextSpan[] }>(el: T, spans: TextSpan[]): T {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { spans: _old, ...base } = el;
  return { ...base, ...textFields(spans) } as T;
}

// ─── Metrics & layout ─────────────────────────────────────────────────

export const BASE_WEIGHT = 500;
export const BOLD_WEIGHT = 700;

/** CSS/canvas font shorthand for a run. */
export function fontFor(marks: TextMarks | undefined, size: number, stack: string) {
  return `${marks?.italic ? 'italic ' : ''}${marks?.bold ? BOLD_WEIGHT : BASE_WEIGHT} ${size}px ${stack}`;
}

export type RunMeasure = (text: string, fontSize: number, marks?: TextMarks) => number;

export const lineWidth = (line: TextSpan[], fontSize: number, measure: RunMeasure) =>
  line.reduce((w, r) => w + measure(r.text, fontSize, r.marks), 0);

/**
 * Greedy word wrap across runs. A "word" may cross run boundaries
 * (e.g. half-bold), so breaks only happen at whitespace.
 */
export function wrapSpans(spans: TextSpan[], maxW: number, fontSize: number, measure: RunMeasure): TextSpan[][] {
  const out: TextSpan[][] = [];
  for (const para of splitLines(spans)) {
    // Tokens: runs split at whitespace, keeping their marks.
    const tokens: TextSpan[] = [];
    for (const r of para) for (const t of r.text.split(/(\s+)/)) if (t) tokens.push({ text: t, marks: r.marks });
    // Words: consecutive non-space tokens, then any trailing space.
    const words: { body: TextSpan[]; space: TextSpan[] }[] = [];
    for (const t of tokens) {
      const isSpace = !t.text.trim();
      const last = words[words.length - 1];
      if (isSpace) {
        if (last) last.space.push(t);
        else words.push({ body: [], space: [t] });
      } else if (last && !last.space.length) last.body.push(t);
      else words.push({ body: [t], space: [] });
    }
    let line: TextSpan[] = [];
    let w = 0;
    for (const word of words) {
      const bodyW = lineWidth(word.body, fontSize, measure);
      if (line.length && w + bodyW > maxW) {
        out.push(trimLine(line));
        line = [];
        w = 0;
      }
      line.push(...word.body, ...word.space);
      w += bodyW + lineWidth(word.space, fontSize, measure);
    }
    out.push(trimLine(line));
  }
  return out;
}

function trimLine(line: TextSpan[]): TextSpan[] {
  const out = line.map((r) => ({ ...r }));
  while (out.length && !out[out.length - 1].text.trim()) out.pop();
  if (out.length) out[out.length - 1].text = out[out.length - 1].text.replace(/\s+$/, '');
  return out;
}

// ─── Editor HTML ⇄ spans ──────────────────────────────────────────────

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** HTML for the contenteditable editor: marks become tags, '\n' becomes <br>. */
export function spansToHTML(spans: TextSpan[]): string {
  let html = spans
    .map((s) => {
      let inner = escapeHtml(s.text).replace(/\n/g, '<br>');
      for (const spec of MARKS) if (s.marks?.[spec.key]) inner = `<${spec.tag}>${inner}</${spec.tag}>`;
      return inner;
    })
    .join('');
  // A trailing line break needs a placeholder <br> to be visible.
  if (html.endsWith('<br>')) html += '<br>';
  return html;
}

const BLOCK = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE']);

/** Read spans back from editor DOM (tags, inline styles, <br> and blocks). */
export function spansFromDOM(root: Node): TextSpan[] {
  const out: TextSpan[] = [];
  const endsWithBreak = () => {
    const last = out[out.length - 1];
    return !last || last.text.endsWith('\n');
  };
  const walk = (node: Node, marks: TextMarks) => {
    if (node.nodeType === 3) {
      const text = (node as Text).data.replace(/ /g, ' ').replace(/​/g, '');
      if (text) out.push({ text, marks: { ...marks } });
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    if (el.tagName === 'BR') {
      out.push({ text: '\n', marks: { ...marks } });
      return;
    }
    const next: TextMarks = { ...marks };
    for (const spec of MARKS) {
      if (spec.tags.includes(el.tagName)) next[spec.key] = true;
      const fromStyle = el.style ? spec.fromStyle?.(el.style) : undefined;
      if (fromStyle !== undefined) next[spec.key] = fromStyle;
    }
    const block = BLOCK.has(el.tagName) && el !== root;
    if (block && !endsWithBreak()) out.push({ text: '\n' });
    el.childNodes.forEach((c) => walk(c, next));
    if (block && !endsWithBreak() && el.nextSibling) out.push({ text: '\n' });
  };
  root.childNodes.forEach((c) => walk(c, {}));
  // A lone trailing <br> is only the editor's placeholder for an empty last line.
  const last = out[out.length - 1];
  if (last?.text === '\n' && out[out.length - 2]?.text.endsWith('\n')) out.pop();
  return normalizeSpans(out);
}
