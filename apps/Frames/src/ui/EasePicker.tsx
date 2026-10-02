import { useRef, useState } from 'react';
import { EASE_CHOICES, bezier, easeLabel, makeEase, springEase } from '../anim/easing';
import type { Easing } from '../model/types';
import { Icon } from './Icon';
import { Popover } from './Popover';
import { Slider } from './controls';

/** A little plot of an easing curve (springs overshoot, so the plot has headroom). */
export function EaseCurve({ ease, size = 40 }: { ease: Easing; size?: number }) {
  const f = makeEase(ease);
  const pts: string[] = [];
  let min = 0, max = 1;
  for (let i = 0; i <= 48; i++) {
    const v = f(i / 48);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  const pad = 4, h = size - pad * 2, w = size - pad * 2;
  for (let i = 0; i <= 48; i++) {
    const v = f(i / 48);
    pts.push(`${(pad + (i / 48) * w).toFixed(1)},${(pad + h - ((v - min) / (max - min || 1)) * h).toFixed(1)}`);
  }
  const base = pad + h - ((0 - min) / (max - min || 1)) * h;
  const top = pad + h - ((1 - min) / (max - min || 1)) * h;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <line x1={pad} x2={size - pad} y1={base} y2={base} stroke="currentColor" strokeOpacity=".2" />
      <line x1={pad} x2={size - pad} y1={top} y2={top} stroke="currentColor" strokeOpacity=".2" strokeDasharray="2 2" />
      <polyline points={pts.join(' ')} fill="none" stroke="var(--tint)" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function BezierEditor({ p, onChange }: { p: [number, number, number, number]; onChange: (p: [number, number, number, number]) => void }) {
  const S = 168, pad = 14;
  const toX = (x: number) => pad + x * (S - pad * 2);
  const toY = (y: number) => S - pad - y * (S - pad * 2);
  const drag = (idx: 0 | 1) => (e: React.PointerEvent<SVGCircleElement>) => {
    const svg = e.currentTarget.ownerSVGElement!;
    e.currentTarget.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (ev.clientX - r.left - pad) / (S - pad * 2)));
      const y = Math.min(2, Math.max(-1, 1 - (ev.clientY - r.top - pad) / (S - pad * 2)));
      const next = [...p] as [number, number, number, number];
      next[idx * 2] = Math.round(x * 100) / 100;
      next[idx * 2 + 1] = Math.round(y * 100) / 100;
      onChange(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ touchAction: 'none', background: 'var(--fill)', borderRadius: 10 }}>
      <rect x={pad} y={pad} width={S - pad * 2} height={S - pad * 2} fill="none" stroke="currentColor" strokeOpacity=".2" />
      <path d={`M${toX(0)} ${toY(0)} C${toX(p[0])} ${toY(p[1])} ${toX(p[2])} ${toY(p[3])} ${toX(1)} ${toY(1)}`} fill="none" stroke="var(--tint)" strokeWidth="2.5" />
      <line x1={toX(0)} y1={toY(0)} x2={toX(p[0])} y2={toY(p[1])} stroke="currentColor" strokeOpacity=".5" />
      <line x1={toX(1)} y1={toY(1)} x2={toX(p[2])} y2={toY(p[3])} stroke="currentColor" strokeOpacity=".5" />
      <circle cx={toX(p[0])} cy={toY(p[1])} r="7" fill="var(--tint)" stroke="#fff" strokeWidth="2" onPointerDown={drag(0)} style={{ cursor: 'grab' }} />
      <circle cx={toX(p[2])} cy={toY(p[3])} r="7" fill="var(--tint)" stroke="#fff" strokeWidth="2" onPointerDown={drag(1)} style={{ cursor: 'grab' }} />
    </svg>
  );
}

export function EasePicker({ value, onChange, label = 'Easing' }: { value: Easing; onChange: (e: Easing) => void; label?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const bez = value.k === 'bezier' ? value.p : ([0.32, 0.72, 0, 1] as [number, number, number, number]);
  const sp = value.k === 'spring' ? value : { k: 'spring' as const, stiffness: 180, damping: 16, mass: 1 };
  return (
    <>
      <button ref={ref} type="button" className="btn ghost sm ease-btn" aria-label={label} onClick={() => setOpen(!open)} style={{ width: '100%', justifyContent: 'flex-start', height: 34 }}>
        <EaseCurve ease={value} size={24} /><span style={{ flex: 1, textAlign: 'left' }}>{easeLabel(value)}</span><Icon name="chevron-down" size={14} />
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} width={300} className="ease-pop">
        <div className="ease-grid">
          {EASE_CHOICES.map((c) => (
            <button key={c.label} type="button" className={`ease-item ${JSON.stringify(c.value) === JSON.stringify(value) ? 'sel' : ''}`} onClick={() => onChange(c.value)}>
              <EaseCurve ease={c.value} size={34} /><span>{c.label}</span>
            </button>
          ))}
        </div>
        <h4 className="pop-h">Custom curve</h4>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <BezierEditor p={bez} onChange={(p) => onChange(bezier(...p))} />
          <div className="mono" style={{ lineHeight: 1.7 }}>{bez.map((n) => n.toFixed(2)).join(', ')}</div>
        </div>
        <h4 className="pop-h">Spring</h4>
        <div className="col" style={{ display: 'grid', gap: 4 }}>
          <Slider label="Stiffness" value={sp.stiffness} min={20} max={600} onChange={(v) => onChange(springEase(v, sp.damping, sp.mass))} format={(v) => `Stiff ${v}`} />
          <Slider label="Damping" value={sp.damping} min={2} max={60} onChange={(v) => onChange(springEase(sp.stiffness, v, sp.mass))} format={(v) => `Damp ${v}`} />
          <Slider label="Mass" value={sp.mass} min={0.2} max={4} step={0.1} onChange={(v) => onChange(springEase(sp.stiffness, sp.damping, v))} format={(v) => `Mass ${v}`} />
          <div className="row"><EaseCurve ease={sp} size={64} /><span className="mono">Lower damping bounces more.</span></div>
        </div>
      </Popover>
    </>
  );
}
