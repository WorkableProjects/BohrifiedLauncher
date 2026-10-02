import type { Align } from '../../model/types';
import { FONTS } from '../../model/theme';
import { Btn, ColorBtn, Num, Select } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { activeEditor, formatBlock, formatInline, useFormat } from '../textfmt';
import { editAny, useSel } from './common';

export const WEIGHTS = [
  { value: '300', label: 'Light' }, { value: '400', label: 'Regular' }, { value: '500', label: 'Medium' }, { value: '600', label: 'Semibold' },
  { value: '700', label: 'Bold' }, { value: '800', label: 'Extra bold' }, { value: '900', label: 'Black' },
];

const FONT_OPTIONS = [{ value: '@heading', label: 'Heading font' }, { value: '@body', label: 'Body font' }, { value: '@mono', label: 'Mono font' }, ...FONTS.map((f) => ({ value: f.name, label: f.name }))];

type TextLike = { doc?: { runs: { size?: number; font?: string; c?: string; w?: number; b?: boolean; ls?: number }[]; align?: Align; lh?: number }[]; base?: { font: string; size: number; weight: number; color: string; ls: number; align: Align; lh: number } };

/** Set a text property on the whole box (base) and clear per-run overrides, so the box is uniform. */
function setWhole(key: 'size' | 'font' | 'color' | 'weight' | 'ls', value: number | string) {
  editAny((e) => {
    const t = e as unknown as TextLike;
    if (!t.base) return;
    if (key === 'size') t.base.size = value as number;
    if (key === 'font') t.base.font = value as string;
    if (key === 'color') t.base.color = value as string;
    if (key === 'weight') t.base.weight = value as number;
    if (key === 'ls') t.base.ls = value as number;
    for (const p of t.doc ?? []) for (const r of p.runs) {
      if (key === 'size') delete r.size;
      if (key === 'font') delete r.font;
      if (key === 'color') delete r.c;
      if (key === 'weight') { delete r.w; delete r.b; }
      if (key === 'ls') delete r.ls;
    }
  }, 'Text style', 'text:' + key);
}

/** Typography controls shared by the inspector and the format bar. */
export function TextControls({ compact = false }: { compact?: boolean }) {
  const { theme, els } = useSel();
  const f = useFormat();
  const editing = !!activeEditor.root;
  const base = f.base ?? (els.find((e) => 'base' in e) as { base?: TextLike['base'] } | undefined)?.base;
  const size = f.size ?? base?.size ?? 36;
  const align = (f.align ?? base?.align ?? 'left') as Align;
  const weight = f.weight ?? base?.weight ?? 400;
  const fontVal = base?.font ?? '@body';
  const noMouseSteal = { onMouseDown: (e: React.MouseEvent) => editing && e.preventDefault() };

  return (
    <div className={`row wrap ${compact ? 'fmt-compact' : ''}`} style={{ gap: 6 }} {...noMouseSteal}>
      <div style={{ width: compact ? 132 : '100%' }}>
        <Select label="Font" value={fontVal} options={FONT_OPTIONS} onChange={(v) => (editing ? formatInline({ font: v }) : setWhole('font', v))} />
      </div>
      <div className="row" style={{ width: compact ? 'auto' : '100%' }}>
        <Btn size="sm" icon="minus" title="Smaller" onClick={() => (editing ? formatInline({ size: Math.max(6, Math.round(size - (size > 40 ? 4 : 2))) }) : setWhole('size', Math.max(6, Math.round(size - (size > 40 ? 4 : 2)))))} />
        <Num label="" value={Math.round(size)} min={6} max={600} width={compact ? 60 : 72} onChange={(v) => (editing ? formatInline({ size: v }) : setWhole('size', v))} />
        <Btn size="sm" icon="plus" title="Larger" onClick={() => (editing ? formatInline({ size: Math.round(size + (size >= 40 ? 4 : 2)) }) : setWhole('size', Math.round(size + (size >= 40 ? 4 : 2))))} />
        {!compact && <Select label="Weight" value={String(weight >= 850 ? 900 : Math.round(weight / 100) * 100)} options={WEIGHTS} onChange={(v) => (editing ? formatInline({ w: Number(v) }) : setWhole('weight', Number(v)))} />}
      </div>
      <div className="row" style={{ gap: 2 }}>
        <Btn size="sm" icon="bold" title="Bold" active={f.b} onClick={() => formatInline({ b: !f.b, ...(f.b ? { w: 400 } : {}) })} />
        <Btn size="sm" icon="italic" title="Italic" active={f.i} onClick={() => formatInline({ i: !f.i })} />
        <Btn size="sm" icon="underline" title="Underline" active={f.u} onClick={() => formatInline({ u: !f.u })} />
        <Btn size="sm" icon="strikethrough" title="Strikethrough" active={f.s} onClick={() => formatInline({ s: !f.s })} />
        {!compact && <Btn size="sm" icon="superscript" title="Superscript" active={f.sup} onClick={() => formatInline({ sup: !f.sup })} />}
        {!compact && <Btn size="sm" icon="subscript" title="Subscript" active={f.sub} onClick={() => formatInline({ sub: !f.sub })} />}
        <ColorBtn value={base?.color ?? '@text'} theme={theme} label="Text colour" onChange={(c) => c && (editing ? formatInline({ c }) : setWhole('color', c))} />
        <span title="Highlight" className="hl-wrap"><ColorBtn value={null} theme={theme} label="Highlight" allowNone onChange={(c) => (editing ? formatInline({ hl: c }) : editAny((e) => { const t = e as unknown as TextLike & { doc?: { runs: { hl?: string }[] }[] }; for (const p of t.doc ?? []) for (const r of p.runs) (r as { hl?: string }).hl = c ?? undefined; }, 'Highlight'))} /></span>
      </div>
      <div className="row" style={{ gap: 2 }}>
        {(['left', 'center', 'right', 'justify'] as Align[]).map((a) => (
          <Btn key={a} size="sm" icon={`align-${a}`} title={`Align ${a}`} active={align === a} onClick={() => formatBlock({ align: a })} />
        ))}
        <Btn size="sm" icon="list" title="Bulleted list" active={f.list === 'bullet'} onClick={() => formatBlock({ list: 'bullet' })} />
        <Btn size="sm" icon="list-ordered" title="Numbered list" active={f.list === 'number'} onClick={() => formatBlock({ list: 'number' })} />
        {!compact && <Btn size="sm" icon="chevron-right" title="Indent" onClick={() => formatBlock({ level: 1 })} />}
        {!compact && <Btn size="sm" icon="chevron-left" title="Outdent" onClick={() => formatBlock({ level: -1 })} />}
      </div>
    </div>
  );
}

export function SpacingControls() {
  const { els } = useSel();
  const t = els.find((e) => 'base' in e) as { base?: TextLike['base'] } | undefined;
  const base = t?.base;
  if (!base) return null;
  return (
    <>
      <div className="row two">
        <Num label="Line" value={base.lh} min={0.6} max={3} step={0.05} precision={2} onChange={(v) => formatBlock({ lh: v })} />
        <Num label="Track" value={base.ls} min={-20} max={80} step={0.5} precision={1} onChange={(v) => setWhole('ls', v)} />
      </div>
    </>
  );
}

void Icon;
