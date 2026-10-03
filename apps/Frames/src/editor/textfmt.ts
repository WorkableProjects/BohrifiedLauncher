import { useEffect, useState } from 'react';
import type { Align, Run, TextBase } from '../model/types';
import { doc } from '../state/session';
import { useStore } from '../state/store';
import { ui } from '../state/ui';
import * as cmd from './commands';
import { applyBlock, applyInline, applyLink, readFormat, setStyleTheme, type FormatState, type InlinePatch } from './richedit';

/**
 * One API for text formatting. While a box is being edited the change goes to
 * the live selection in the editor; otherwise it applies to every run of the
 * selected text boxes.
 */

export const activeEditor: { root: HTMLElement | null } = { root: null };

export function formatInline(patch: InlinePatch) {
  if (activeEditor.root) {
    setStyleTheme(doc.deck.theme);
    return applyInline(activeEditor.root, patch);
  }
  const run: Partial<Run> = {};
  for (const [k, v] of Object.entries(patch)) (run as Record<string, unknown>)[k] = v === null || v === false ? undefined : v;
  cmd.setRuns(run);
}

export function formatBlock(patch: { align?: Align; list?: 'bullet' | 'number' | null; level?: number; lh?: number; before?: number; after?: number }) {
  if (activeEditor.root) return applyBlock(activeEditor.root, patch);
  cmd.setProps((e) => {
    const paras = e.type === 'text' || e.type === 'shape' ? e.doc : undefined;
    const base = (e.type === 'text' || e.type === 'shape' || e.type === 'table') && e.base ? e.base : null;
    if (patch.align && base) base.align = patch.align;
    if (patch.lh !== undefined && base) base.lh = patch.lh;
    for (const p of paras ?? []) {
      if (patch.align) p.align = patch.align;
      if (patch.lh !== undefined) p.lh = patch.lh;
      if (patch.before !== undefined) p.before = patch.before;
      if (patch.after !== undefined) p.after = patch.after;
      if (patch.list !== undefined) p.list = p.list === patch.list ? null : patch.list;
      if (patch.level !== undefined && p.list) p.level = Math.max(0, Math.min(4, (p.level ?? 0) + patch.level));
    }
  }, 'Paragraph', 'Paragraph');
}

export function formatLink(url: string | null) {
  if (activeEditor.root) return applyLink(activeEditor.root, url);
  cmd.setRuns({ link: url ?? undefined }, 'Link');
}

/** What the toolbar should show for the current selection. */
export function useFormat(): Partial<FormatState> & { base?: TextBase } {
  const editing = useStore(ui, (s) => s.editing);
  const sel = useStore(ui, (s) => s.sel);
  const [live, setLive] = useState<FormatState | null>(null);
  useEffect(() => {
    if (editing?.type !== 'text') return setLive(null);
    const read = () => activeEditor.root && setLive(readFormat(activeEditor.root));
    document.addEventListener('selectionchange', read);
    read();
    return () => document.removeEventListener('selectionchange', read);
  }, [editing]);
  if (live) return live;
  const el = cmd.selectedEls().find((e) => e.type === 'text' || e.type === 'shape');
  void sel;
  if (!el || !('base' in el) || !el.base || !('doc' in el) || !el.doc) return {};
  const base = el.base;
  const r = el.doc[0]?.runs[0];
  return {
    base,
    b: (r?.w ?? (r?.b ? 700 : base.weight)) >= 600,
    i: r?.i ?? base.italic ?? false,
    u: !!r?.u,
    s: !!r?.s,
    sup: !!r?.sup,
    sub: !!r?.sub,
    size: r?.size ?? base.size,
    align: el.doc[0]?.align ?? base.align,
    list: el.doc[0]?.list ?? null,
    weight: r?.w ?? base.weight,
  };
}
