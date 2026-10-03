import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { toHex, parseColor, formatColor } from '../model/color';
import { resolveColor } from '../model/theme';
import type { Color, DesignSystem, Fill } from '../model/types';
import { Icon } from './Icon';
import { Popover } from './Popover';

// ── Buttons ──────────────────────────────────────────────────────────────────

interface BtnProps {
  icon?: string;
  label?: string;
  title?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: 'plain' | 'tint' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  className?: string;
  badge?: string;
  btnRef?: React.Ref<HTMLButtonElement>;
  pressed?: boolean;
  children?: ReactNode;
}

export function Btn({ icon, label, title, active, disabled, onClick, variant = 'plain', size = 'md', className = '', badge, btnRef, children }: BtnProps) {
  return (
    <button
      ref={btnRef}
      type="button"
      className={`btn ${variant} ${size} ${active ? 'on' : ''} ${label ? 'has-label' : ''} ${className}`}
      title={title ?? label}
      aria-label={title ?? label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onClick={onClick}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} />}
      {label && <span>{label}</span>}
      {children}
      {badge && <kbd>{badge}</kbd>}
    </button>
  );
}

// ── Segmented / toggle ───────────────────────────────────────────────────────

export function Seg<T extends string | number | boolean>({ value, options, onChange, label }: { value: T; options: { value: T; label?: ReactNode; icon?: string; title?: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} title={o.title} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={16} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return <input type="checkbox" role="switch" className="switch" checked={value} aria-label={label} onChange={(e) => onChange(e.target.checked)} />;
}

// ── Fields ───────────────────────────────────────────────────────────────────

export function Field({ label, children, hint, wide }: { label: string; children: ReactNode; hint?: string; wide?: boolean }) {
  return (
    <div className={`field ${wide ? 'wide' : ''}`}>
      <label>{label}</label>
      <div className="field-c">{children}</div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function Section({ title, children, defaultOpen = true, action, id }: { title: string; children: ReactNode; defaultOpen?: boolean; action?: ReactNode; id?: string }) {
  const key = `frames:sec:${id ?? title}`;
  const [open, setOpen] = useState(() => {
    try {
      const v = sessionStorage.getItem(key);
      return v === null ? defaultOpen : v === '1';
    } catch {
      return defaultOpen;
    }
  });
  return (
    <section className="sec">
      <header>
        <button type="button" className="sec-h" aria-expanded={open} onClick={() => {
          setOpen(!open);
          try { sessionStorage.setItem(key, open ? '0' : '1'); } catch { /* ignore */ }
        }}>
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
          {title}
        </button>
        {action}
      </header>
      {open && <div className="sec-b">{children}</div>}
    </section>
  );
}

/** A number input you can also scrub by dragging its label. */
export function Num({ value, onChange, min, max, step = 1, unit, label, width, precision = 2, disabled }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string; label?: string; width?: number; precision?: number; disabled?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const clamp = useCallback((v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)), [min, max]);
  const shown = text ?? String(+value.toFixed(precision));
  const commit = (t: string) => {
    setText(null);
    const v = parseFloat(t);
    if (Number.isFinite(v)) onChange(clamp(v));
  };
  const scrub = (e: React.PointerEvent) => {
    if (disabled) return;
    const startX = e.clientX, start = value;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => onChange(clamp(+(start + Math.round((ev.clientX - startX) / 3) * step * (ev.shiftKey ? 10 : 1)).toFixed(precision)));
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };
  return (
    <div className="num" style={{ width }}>
      {label && <span className="num-l" onPointerDown={scrub} title="Drag to adjust">{label}</span>}
      <input
        inputMode="decimal"
        value={shown}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => text !== null && commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setText(null);
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            onChange(clamp(+(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)).toFixed(precision)));
          }
        }}
      />
      {unit && <span className="num-u">{unit}</span>}
    </div>
  );
}

export function Slider({ value, onChange, min, max, step = 1, label, format }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; label: string; format?: (v: number) => string }) {
  return (
    <div className="slider">
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <output>{format ? format(value) : +value.toFixed(2)}</output>
    </div>
  );
}

export function Select<T extends string>({ value, options, onChange, label, width }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; width?: number }) {
  return (
    <select className="select" value={value} aria-label={label} style={{ width }} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function TextInput({ value, onChange, placeholder, multiline, rows = 3, label, onCommit }: { value: string; onChange?: (v: string) => void; placeholder?: string; multiline?: boolean; rows?: number; label: string; onCommit?: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  const props = {
    value: local,
    placeholder,
    'aria-label': label,
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => {
      setLocal(e.target.value);
      onChange?.(e.target.value);
    },
    onBlur: () => onCommit?.(local),
    onKeyDown: (e: React.KeyboardEvent) => {
      e.stopPropagation();
      if (!multiline && e.key === 'Enter') (e.target as HTMLElement).blur();
    },
  };
  return multiline ? <textarea className="text-in" rows={rows} {...props} /> : <input className="text-in" {...props} />;
}

// ── Colour ───────────────────────────────────────────────────────────────────

const TOKENS: { id: string; label: string }[] = [
  { id: '@text', label: 'Text' },
  { id: '@muted', label: 'Muted' },
  { id: '@bg', label: 'Background' },
  { id: '@surface', label: 'Surface' },
  { id: '@primary', label: 'Primary' },
  { id: '@secondary', label: 'Secondary' },
  { id: '@accent', label: 'Accent' },
  { id: '@success', label: 'Success' },
  { id: '@danger', label: 'Danger' },
];
const GRAYS = ['#ffffff', '#f2f2f7', '#d1d1d6', '#8e8e93', '#48484a', '#1c1c1e', '#000000'];
const HUES = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#0a84ff', '#5e5ce6', '#bf5af2', '#ff2d92', '#a2845e'];

export function ColorBtn({ value, onChange, theme, allowNone, label, alpha = true, size = 24 }: { value: Color | null | undefined; onChange: (c: Color | null) => void; theme: DesignSystem; allowNone?: boolean; label: string; alpha?: boolean; size?: number }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const shown = value ? resolveColor(theme, value) : null;
  return (
    <>
      <button ref={ref} type="button" className={`swatch ${shown ? '' : 'none'}`} style={{ width: size, height: size, ['--c' as string]: shown ?? 'transparent' }} aria-label={label} title={label} onClick={() => setOpen(!open)} />
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} className="colors" width={236}>
        <ColorPanel value={value ?? null} onChange={onChange} theme={theme} allowNone={allowNone} alpha={alpha} />
      </Popover>
    </>
  );
}

export function ColorPanel({ value, onChange, theme, allowNone, alpha }: { value: Color | null; onChange: (c: Color | null) => void; theme: DesignSystem; allowNone?: boolean; alpha?: boolean }) {
  const resolved = value ? resolveColor(theme, value) : '#000000';
  const rgba = parseColor(resolved);
  const [hex, setHex] = useState(toHex(resolved));
  useEffect(() => setHex(toHex(resolved)), [resolved]);
  const sw = (c: string, title: string) => (
    <button key={c + title} type="button" className={`swatch sm ${value === c ? 'sel' : ''}`} style={{ ['--c' as string]: c[0] === '@' ? resolveColor(theme, c) : c }} title={title} aria-label={title} onClick={() => onChange(c)} />
  );
  return (
    <div className="color-panel">
      <div className="sw-row" aria-label="Theme colours">{TOKENS.map((t) => sw(t.id, t.label))}</div>
      <div className="sw-row" aria-label="Palette">{theme.palette.map((c, i) => sw(c, `Palette ${i + 1}`))}</div>
      <div className="sw-row">{HUES.map((c) => sw(c, c))}</div>
      <div className="sw-row">{GRAYS.map((c) => sw(c, c))}</div>
      <div className="hex-row">
        <input type="color" aria-label="Pick a colour" value={toHex(resolved)} onChange={(e) => onChange(e.target.value)} />
        <input className="text-in" aria-label="Hex colour" value={hex} onChange={(e) => setHex(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') onChange(hex.startsWith('#') ? hex : '#' + hex); }} onBlur={() => /^#?[0-9a-f]{6}$/i.test(hex) && onChange(hex.startsWith('#') ? hex : '#' + hex)} />
        {allowNone && <button type="button" className="btn plain sm" onClick={() => onChange(null)}>None</button>}
      </div>
      {alpha && (
        <div className="slider">
          <input type="range" min={0} max={1} step={0.01} value={rgba.a} aria-label="Opacity" onChange={(e) => onChange(formatColor({ ...rgba, a: parseFloat(e.target.value) }))} />
          <output>{Math.round(rgba.a * 100)}%</output>
        </div>
      )}
    </div>
  );
}

/** Solid / gradient / none fill editor. */
export function FillEditor({ value, onChange, theme, label }: { value: Fill | null | undefined; onChange: (f: Fill | null) => void; theme: DesignSystem; label: string }) {
  const kind = !value ? 'none' : value.t === 'solid' ? 'solid' : value.t === 'image' ? 'image' : 'gradient';
  const stops = value && (value.t === 'linear' || value.t === 'radial') ? value.stops : null;
  const setKind = (k: string) => {
    if (k === 'none') onChange(null);
    else if (k === 'solid') onChange({ t: 'solid', c: value && value.t === 'solid' ? value.c : stops?.[0]?.c ?? '@primary' });
    else if (k === 'gradient') {
      const c = value && value.t === 'solid' ? value.c : '@primary';
      onChange({ t: 'linear', angle: 135, stops: [{ o: 0, c }, { o: 1, c: '@secondary' }] });
    }
  };
  return (
    <div className="fill-ed">
      <Seg value={kind} onChange={setKind} label={label} options={[{ value: 'none', label: 'None' }, { value: 'solid', label: 'Solid' }, { value: 'gradient', label: 'Gradient' }]} />
      {value?.t === 'solid' && <div className="row"><ColorBtn value={value.c} theme={theme} label={`${label} colour`} onChange={(c) => c && onChange({ t: 'solid', c })} /><span className="mono">{value.c[0] === '@' ? value.c.slice(1) : toHex(resolveColor(theme, value.c))}</span></div>}
      {stops && value && (value.t === 'linear' || value.t === 'radial') && (
        <div className="row wrap">
          {stops.map((s, i) => (
            <ColorBtn key={i} value={s.c} theme={theme} label={`Stop ${i + 1}`} onChange={(c) => c && onChange({ ...value, stops: stops.map((x, j) => (j === i ? { ...x, c } : x)) })} />
          ))}
          <button type="button" className="btn plain sm" onClick={() => onChange({ ...value, stops: [...stops].reverse().map((s) => ({ ...s, o: 1 - s.o })) })} title="Reverse">
            <Icon name="flip-h" size={14} />
          </button>
          {value.t === 'linear' && <Num value={value.angle} onChange={(angle) => onChange({ ...value, angle })} min={0} max={360} step={5} unit="°" width={78} label="∠" />}
          <button type="button" className="btn plain sm" onClick={() => onChange(value.t === 'linear' ? { t: 'radial', stops } : { t: 'linear', angle: 135, stops })}>{value.t === 'linear' ? 'Radial' : 'Linear'}</button>
        </div>
      )}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={28} sw={1.4} />
      <b>{title}</b>
      {children && <p>{children}</p>}
    </div>
  );
}
