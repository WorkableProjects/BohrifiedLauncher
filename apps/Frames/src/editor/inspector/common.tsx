import { useSyncExternalStore } from 'react';
import type { DesignSystem, El, Slide } from '../../model/types';
import { doc, currentSlide } from '../../state/session';
import { useStore } from '../../state/store';
import { ui } from '../../state/ui';
import * as cmd from '../commands';
import * as ops from '../../model/ops';

export interface Sel {
  slide: Slide | undefined;
  els: El[];
  one: El | null;
  theme: DesignSystem;
  ids: string[];
}

/** The current selection, re-read whenever the document or selection changes. */
export function useSel(): Sel {
  const deck = useSyncExternalStore(doc.subscribe, () => doc.deck);
  const sel = useStore(ui, (s) => s.sel);
  const slideId = useStore(ui, (s) => s.slideId);
  const slide = deck.slides.find((s) => s.id === slideId) ?? currentSlide();
  const els = slide ? sel.map((id) => ops.findEl(slide.elements, id)).filter((e): e is El => !!e) : [];
  return { slide, els, one: els.length === 1 ? els[0]! : null, theme: deck.theme, ids: els.map((e) => e.id) };
}

/** Edit the selected elements of one type. `merge` folds a drag of a slider into one undo step. */
export function edit<T extends El['type']>(type: T, fn: (e: Extract<El, { type: T }>) => void, label = 'Edit', merge?: string) {
  cmd.setProps((e) => {
    if (e.type === type) fn(e as Extract<El, { type: T }>);
  }, label, merge ?? label);
}

export const editAny = (fn: (e: El) => void, label = 'Edit', merge?: string) => cmd.setProps(fn, label, merge ?? label);

/** Common value of a property across elements, or undefined when they differ. */
export function common<T>(els: El[], get: (e: El) => T | undefined): T | undefined {
  if (!els.length) return undefined;
  const first = get(els[0]!);
  return els.every((e) => JSON.stringify(get(e)) === JSON.stringify(first)) ? first : undefined;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
