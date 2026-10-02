import { useMemo, useRef, useState } from 'react';
import { ICON_GROUPS, ICON_KEYWORDS } from '../render/icons';
import { SHAPE_GROUPS, shapeIconPath } from '../render/shapes';
import type { ChartKind, ShapeKind } from '../model/types';
import { Icon } from '../ui/Icon';
import { ui } from '../state/ui';
import * as cmd from './commands';

export function ShapePicker({ onDone }: { onDone: () => void }) {
  return (
    <div className="picker shapes">
      {SHAPE_GROUPS.map((g) => (
        <div key={g.name}>
          <h4>{g.name}</h4>
          <div className="grid">
            {g.kinds.map((k) => (
              <button key={k} type="button" title={k.replace(/-/g, ' ')} aria-label={k.replace(/-/g, ' ')} onClick={() => { cmd.insertShape(k as ShapeKind); onDone(); }}>
                <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" fillOpacity="0.14" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"><path d={shapeIconPath(k as ShapeKind)} /></svg>
              </button>
            ))}
          </div>
        </div>
      ))}
      <button type="button" className="btn plain sm draw" onClick={() => { ui.set({ tool: 'shape' }); onDone(); }}>
        <Icon name="move" size={14} /> Draw a shape by dragging
      </button>
    </div>
  );
}

export function IconPicker({ onDone }: { onDone: () => void }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return ICON_GROUPS;
    const all = ICON_GROUPS.flatMap((g) => g.icons);
    const hits = all.filter((n) => n.includes(s) || (ICON_KEYWORDS[n] ?? '').includes(s));
    return [{ name: `${hits.length} result${hits.length === 1 ? '' : 's'}`, icons: hits }];
  }, [q]);
  return (
    <div className="picker icons">
      <input autoFocus className="text-in" placeholder="Search icons" aria-label="Search icons" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      <div className="icon-scroll">
        {groups.map((g) => (
          <div key={g.name}>
            <h4>{g.name}</h4>
            <div className="grid">
              {g.icons.map((n) => (
                <button key={n} type="button" title={n.replace(/-/g, ' ')} aria-label={n.replace(/-/g, ' ')} onClick={() => { cmd.insertIcon(n); onDone(); }}>
                  <Icon name={n} size={22} />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TablePicker({ onDone }: { onDone: () => void }) {
  const [hover, setHover] = useState<[number, number]>([3, 3]);
  const ROWS = 7, COLS = 8;
  return (
    <div className="picker table-pick">
      <div className="tp-grid" style={{ gridTemplateColumns: `repeat(${COLS}, 22px)` }}>
        {Array.from({ length: ROWS * COLS }, (_, i) => {
          const r = Math.floor(i / COLS) + 1, c = (i % COLS) + 1;
          return <button key={i} type="button" aria-label={`${r} by ${c} table`} className={r <= hover[0] && c <= hover[1] ? 'on' : ''} onPointerEnter={() => setHover([r, c])} onFocus={() => setHover([r, c])} onClick={() => { cmd.insertTable(r, c); onDone(); }} />;
        })}
      </div>
      <p className="tp-label">{hover[0]} × {hover[1]}</p>
    </div>
  );
}

export const CHARTS: { kind: ChartKind; label: string; icon: string }[] = [
  { kind: 'column', label: 'Column', icon: 'bar-chart' },
  { kind: 'bar', label: 'Bar', icon: 'align-left' },
  { kind: 'line', label: 'Line', icon: 'trending-up' },
  { kind: 'area', label: 'Area', icon: 'activity' },
  { kind: 'pie', label: 'Pie', icon: 'pie-chart' },
  { kind: 'donut', label: 'Donut', icon: 'target' },
  { kind: 'scatter', label: 'Scatter', icon: 'crosshair' },
];

/** A hidden <input type=file> opened from code. */
export function useFilePicker(accept: string, onFiles: (files: File[]) => void, multiple = true) {
  const ref = useRef<HTMLInputElement | null>(null);
  const el = (
    <input
      ref={ref}
      type="file"
      accept={accept}
      multiple={multiple}
      hidden
      onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = '';
        if (files.length) onFiles(files);
      }}
    />
  );
  return { open: () => ref.current?.click(), el };
}
