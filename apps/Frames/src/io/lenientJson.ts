/**
 * A forgiving JSON reader for text written by people and AI assistants.
 *
 * On top of strict JSON it accepts: // # and /* *\/ comments, trailing and
 * missing commas, 'single' and “smart” quotes, unquoted keys and words,
 * raw newlines inside strings, unknown escapes, NaN/Infinity/undefined, and
 * input that stops early (every open string, list and object is closed).
 * It never throws on content; `parseLenient` throws only when there is no
 * value at all.
 */

const OPEN_Q: Record<string, string> = { '"': '"', "'": "'", '“': '”', '”': '”', '‘': '’', '’': '’', '„': '“', '«': '»' };

class Reader {
  i = 0;
  repaired = false;
  constructor(private s: string) {}

  private ws() {
    const s = this.s;
    for (;;) {
      const c = s[this.i];
      if (c === undefined) return;
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === ' ' || c === '﻿') { this.i++; continue; }
      if (c === '/' && s[this.i + 1] === '/') { this.skipLine(); this.repaired = true; continue; }
      if (c === '#') { this.skipLine(); this.repaired = true; continue; }
      if (c === '/' && s[this.i + 1] === '*') {
        const end = s.indexOf('*/', this.i + 2);
        this.i = end < 0 ? s.length : end + 2;
        this.repaired = true;
        continue;
      }
      return;
    }
  }
  private skipLine() {
    const n = this.s.indexOf('\n', this.i);
    this.i = n < 0 ? this.s.length : n + 1;
  }
  get done() { this.ws(); return this.i >= this.s.length; }

  value(depth = 0): unknown {
    this.ws();
    const c = this.s[this.i];
    if (c === undefined) return undefined;
    if (depth > 200) { this.i = this.s.length; return null; }
    if (c === '{') return this.object(depth);
    if (c === '[') return this.array(depth);
    if (c in OPEN_Q) return this.string();
    if (c === '-' || c === '+' || c === '.' || (c >= '0' && c <= '9')) return this.number();
    return this.word();
  }

  private object(depth: number): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    this.i++;
    for (;;) {
      this.ws();
      const c = this.s[this.i];
      if (c === undefined) { this.repaired = true; return out; }
      if (c === '}') { this.i++; return out; }
      if (c === ',' || c === ';') { this.i++; continue; }
      if (c === ']') { this.i++; this.repaired = true; return out; }
      const key = c in OPEN_Q ? this.string() : this.bareKey();
      this.ws();
      if (this.s[this.i] === ':' || this.s[this.i] === '=') this.i++;
      else this.repaired = true;
      const v = this.value(depth + 1);
      if (key !== '' && key !== '__proto__' && key !== 'constructor' && key !== 'prototype') out[key] = v === undefined ? null : v;
      if (key === '') this.repaired = true;
    }
  }

  private array(depth: number): unknown[] {
    const out: unknown[] = [];
    this.i++;
    for (;;) {
      this.ws();
      const c = this.s[this.i];
      if (c === undefined) { this.repaired = true; return out; }
      if (c === ']') { this.i++; return out; }
      if (c === ',' || c === ';') { this.i++; continue; }
      if (c === '}') { this.i++; this.repaired = true; return out; }
      const before = this.i;
      const v = this.value(depth + 1);
      if (this.i === before) { this.i++; this.repaired = true; continue; }
      if (v !== undefined) out.push(v);
    }
  }

  private string(): string {
    const s = this.s;
    const close = OPEN_Q[s[this.i]!]!;
    const plain = s[this.i] === '"';
    if (!plain) this.repaired = true;
    this.i++;
    let out = '';
    for (;;) {
      const c = s[this.i];
      if (c === undefined) { this.repaired = true; return out; }
      this.i++;
      // A smart closing quote also ends a string opened with a straight quote.
      if (c === close || (plain && c === '”')) return out;
      if (c === '\\') {
        const e = s[this.i++];
        if (e === undefined) return out;
        if (e === 'n') out += '\n';
        else if (e === 't') out += '\t';
        else if (e === 'r') out += '';
        else if (e === 'b' || e === 'f') out += '';
        else if (e === 'u') {
          const hex = s.slice(this.i, this.i + 4);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) { out += String.fromCharCode(parseInt(hex, 16)); this.i += 4; }
          else out += 'u';
        } else out += e;
        continue;
      }
      if (c === '\n' || c === '\r') this.repaired = true;
      out += c;
    }
  }

  private number(): unknown {
    const m = /^[+-]?(\d[\d_,]*\.?\d*|\.\d+)([eE][+-]?\d+)?%?/.exec(this.s.slice(this.i));
    if (!m) return this.word();
    this.i += m[0].length;
    const raw = m[0];
    // "50%" stays a string: geometry fields understand percentages.
    if (raw.endsWith('%')) return raw;
    const n = Number(raw.replace(/[_,]/g, '').replace(/^\+/, ''));
    return Number.isFinite(n) ? n : 0;
  }

  private bareKey(): string {
    const m = /^[^:=,{}[\]\s]+/.exec(this.s.slice(this.i));
    if (!m) { this.i++; return ''; }
    this.i += m[0].length;
    this.repaired = true;
    return m[0];
  }

  private word(): unknown {
    // Bare words run until a structural character; inside lists a comma ends them.
    const m = /^[^,{}[\]\n\r]+/.exec(this.s.slice(this.i));
    if (!m) { this.i++; return undefined; }
    const raw = m[0].trim();
    this.i += m[0].length;
    switch (raw) {
      case 'true': case 'True': case 'TRUE': case 'yes': return true;
      case 'false': case 'False': case 'FALSE': case 'no': return false;
      case 'null': case 'None': case 'nil': case 'undefined': return null;
      case 'NaN': case 'Infinity': case '-Infinity': return 0;
    }
    this.repaired = true;
    return raw;
  }
}

/** Parse forgiving JSON. `repaired` says whether anything had to be fixed. */
export function parseLenient(text: string): { value: unknown; repaired: boolean } {
  try {
    return { value: JSON.parse(text), repaired: false };
  } catch {
    /* fall through to the forgiving reader */
  }
  const r = new Reader(text);
  const value = r.value();
  if (value === undefined || value === null || typeof value !== 'object') throw new Error('No JSON object found.');
  return { value, repaired: true };
}
