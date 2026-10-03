import { clone } from '../model/clone';
import { uid } from '../model/ids';
import type { El, Effects, Fill, Run, StylePreset, Stroke, TextBase } from '../model/types';
import { doc } from '../state/session';
import { toast, ui } from '../state/ui';
import * as cmd from './commands';

/** What the format painter carries. */
export interface StyleBag {
  fill?: Fill | null;
  stroke?: Stroke | null;
  radius?: number;
  fx?: Effects;
  opacity?: number;
  base?: TextBase;
  run?: Partial<Run>;
}

export function bagOf(e: El): StyleBag {
  const bag: StyleBag = { opacity: e.opacity, fx: e.fx ? clone(e.fx) : undefined };
  if (e.type === 'text' || e.type === 'shape') {
    bag.fill = e.fill ? clone(e.fill) : e.fill;
    bag.stroke = e.stroke ? clone(e.stroke) : e.stroke;
    bag.radius = e.radius;
    if (e.base) bag.base = clone(e.base);
    const r = e.doc?.[0]?.runs[0];
    if (r) {
      const { t: _t, ...rest } = r;
      void _t;
      bag.run = clone(rest);
    }
  }
  if (e.type === 'line') bag.stroke = clone(e.stroke);
  if (e.type === 'image') bag.stroke = e.stroke ? clone(e.stroke) : e.stroke;
  return bag;
}

export function applyBag(bag: StyleBag, ids = ui.get().sel) {
  cmd.setProps((e) => {
    e.opacity = bag.opacity ?? e.opacity;
    e.fx = bag.fx ? clone(bag.fx) : undefined;
    if (e.type === 'text' || e.type === 'shape') {
      if ('fill' in bag) e.fill = bag.fill ? clone(bag.fill) : bag.fill ?? null;
      if ('stroke' in bag) e.stroke = bag.stroke ? clone(bag.stroke) : null;
      if (bag.radius !== undefined) e.radius = bag.radius;
      if (bag.base && e.base) Object.assign(e.base, { ...bag.base, align: e.base.align, size: bag.base.size });
      else if (bag.base && e.type === 'shape') e.base = clone(bag.base);
      if (bag.run && e.doc) for (const p of e.doc) for (const r of p.runs) Object.assign(r, bag.run);
    }
    if (e.type === 'line' && bag.stroke) e.stroke = clone(bag.stroke);
    if (e.type === 'image' && 'stroke' in bag) e.stroke = bag.stroke ? clone(bag.stroke) : null;
  }, 'Paste style', undefined, ids);
}

export function copyStyle() {
  const e = cmd.selectedEls()[0];
  if (!e) return toast('Select something to copy its style.');
  ui.set({ painter: bagOf(e) });
  toast('Style copied. Select something and paste it.');
}

export function pasteStyle() {
  const bag = ui.get().painter as StyleBag | null;
  if (!bag) return toast('Copy a style first.');
  if (!ui.get().sel.length) return toast('Select something to paste the style onto.');
  applyBag(bag);
}

export function savePreset(name: string): StylePreset | null {
  const e = cmd.selectedEls()[0];
  if (!e) return null;
  const bag = bagOf(e);
  const preset: StylePreset = { id: uid('st'), name, kind: e.type === 'text' ? 'text' : 'shape', props: { fill: bag.fill, stroke: bag.stroke, radius: bag.radius, fx: bag.fx, opacity: bag.opacity, base: bag.base, run: bag.run } };
  doc.commit('Save style', (d) => { d.styles.push(preset); });
  return preset;
}

export function applyPreset(p: StylePreset) {
  applyBag({ fill: p.props.fill, stroke: p.props.stroke, radius: p.props.radius, fx: p.props.fx, opacity: p.props.opacity, base: p.props.base, run: p.props.run });
}

export function deletePreset(id: string) {
  doc.commit('Delete style', (d) => { d.styles = d.styles.filter((s) => s.id !== id); });
}
