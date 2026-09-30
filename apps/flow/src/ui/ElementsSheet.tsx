import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getController } from '../canvas/instance';
import { elementBounds, unionRects } from '../engine/geometry';
import { bohrModel, electronConfigText, lewisDot, MAX_ENERGY_LEVELS, MAX_VALENCE, orbitalCapacity, orbitalDiagram, SUBSHELLS, type PresetOptions } from '../engine/presets';
import { boardTheme, type Appearance } from '../engine/theme';
import type { BoardElement } from '../engine/types';
import { usePresence } from '../hooks/usePresence';
import { Icon, type IconName } from '../icons/Icon';
import { board } from '../state/board';
import { toast, ui, useUI } from '../state/ui';
import { BubbleGroup } from './Bubble';
import { Toggle, ToolButton } from './controls';

type PresetId = 'bohr' | 'orbital' | 'lewis' | 'config';

interface Preset {
  id: PresetId;
  icon: IconName;
  title: string;
  detail: string;
}

/** Presets offered by Elements. New resources are an entry here plus a builder in engine/presets. */
const PRESETS: Preset[] = [
  { id: 'bohr', icon: 'atom', title: 'Bohr Model', detail: 'Nucleus and energy levels' },
  { id: 'orbital', icon: 'atom', title: 'Orbital Diagram', detail: 'Boxes and arrows, 1s–7p' },
  { id: 'lewis', icon: 'atom', title: 'Lewis Dot', detail: 'Symbol and valence dots' },
  { id: 'config', icon: 'atom', title: 'Configuration', detail: 'Electron configuration' },
];

/** Draws preset elements as SVG, so the preview is exactly what gets inserted. */
function ElementsPreview({ els, appearance, label }: { els: BoardElement[]; appearance: Appearance; label: string }) {
  const theme = boardTheme(appearance);
  const box = unionRects(els.map(elementBounds)) ?? { x: -50, y: -50, w: 100, h: 100 };
  const pad = 8;
  const vb = `${box.x - pad} ${box.y - pad} ${box.w + pad * 2} ${box.h + pad * 2}`;
  return (
    <svg viewBox={vb} className="h-[190px] w-full max-w-[360px]" role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      {els.map((e) => {
        if (e.type === 'shape') {
          const color = theme.resolve(e.color);
          if (e.kind === 'ellipse') return <ellipse key={e.id} cx={(e.x1 + e.x2) / 2} cy={(e.y1 + e.y2) / 2} rx={Math.abs(e.x2 - e.x1) / 2} ry={Math.abs(e.y2 - e.y1) / 2} fill="none" stroke={color} strokeWidth={e.size} />;
          if (e.kind === 'rect') return <rect key={e.id} x={Math.min(e.x1, e.x2)} y={Math.min(e.y1, e.y2)} width={Math.abs(e.x2 - e.x1)} height={Math.abs(e.y2 - e.y1)} rx={Math.min(Math.abs(e.x2 - e.x1), Math.abs(e.y2 - e.y1)) * 0.12} fill="none" stroke={color} strokeWidth={e.size} />;
          if (e.kind === 'arrow') {
            const a = Math.atan2(e.y2 - e.y1, e.x2 - e.x1);
            const len = Math.min(Math.hypot(e.x2 - e.x1, e.y2 - e.y1) * 0.5, Math.max(12, e.size * 4));
            const sp = Math.PI / 7;
            const d = `M${e.x1} ${e.y1}L${e.x2} ${e.y2}M${e.x2 - len * Math.cos(a - sp)} ${e.y2 - len * Math.sin(a - sp)}L${e.x2} ${e.y2}L${e.x2 - len * Math.cos(a + sp)} ${e.y2 - len * Math.sin(a + sp)}`;
            return <path key={e.id} d={d} fill="none" stroke={color} strokeWidth={e.size} strokeLinecap="round" strokeLinejoin="round" />;
          }
        }
        if (e.type === 'dot') return <circle key={e.id} cx={e.x} cy={e.y} r={e.r} fill={theme.resolve(e.color)} />;
        if (e.type === 'text') return <text key={e.id} x={e.x} y={e.y + e.fontSize * 0.95} fontSize={e.fontSize} fontWeight={700} fontFamily="var(--font)" fill={theme.resolve(e.color)}>{e.text}</text>;
        return null;
      })}
    </svg>
  );
}

/** A labelled row of exclusive chips. */
function Chips<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(o)}
          className={`spring h-9 min-w-10 shrink-0 rounded-full px-3 text-subhead font-semibold tabular-nums ${value === o ? 'bg-tint text-on-tint' : 'bg-fill text-label-2 hover:text-label'}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const btn = 'spring flex h-9 w-9 items-center justify-center rounded-full bg-fill text-headline text-label hover:bg-fill-2 disabled:opacity-40';
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" className={btn} aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <span className="min-w-8 text-center text-headline font-semibold tabular-nums">{value}</span>
      <button type="button" className={btn} aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

const Heading = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="mb-1.5 flex items-baseline justify-between gap-3">
    <span className="text-subhead font-semibold text-label">{title}</span>
    {hint && <span className="text-footnote text-label-2">{hint}</span>}
  </div>
);

/**
 * Elements: chemistry and physics resources in a few clicks. Pick a preset,
 * adjust it, and drop it on the board as ordinary editable elements.
 */
export function ElementsSheet({ appearance }: { appearance: Appearance }) {
  const open = useUI((s) => s.elementsOpen);
  const timerOpen = useUI((s) => s.timerOpen);
  const penColor = useUI((s) => s.pen.color);
  const { mounted, leaving } = usePresence(open);
  const [preset, setPreset] = useState<PresetId>('bohr');
  const [levels, setLevels] = useState(2);
  const [qmm, setQmm] = useState(false);
  const [through, setThrough] = useState('2p');
  const [electrons, setElectrons] = useState(0);
  const [symbol, setSymbol] = useState('C');
  const [valence, setValence] = useState(4);
  const sheet = useRef<HTMLElement>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => sheet.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  }, [open]);

  const capacity = orbitalCapacity(through);
  const electronCount = Math.min(electrons, capacity);
  const build = (o: PresetOptions): BoardElement[] => {
    switch (preset) {
      case 'bohr': return bohrModel(levels, o, { qmm });
      case 'orbital': return orbitalDiagram(through, electronCount, o);
      case 'lewis': return lewisDot(symbol, valence, o);
      case 'config': return electronConfigText(electronCount, through, o);
    }
  };
  const previewEls = useMemo(
    () => build({ cx: 0, cy: 0, unit: 1, color: penColor }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preset, levels, qmm, through, electronCount, symbol, valence, penColor],
  );

  const close = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && sheet.current?.contains(active)) active.blur();
    ui.set({ elementsOpen: false });
  };

  const insert = () => {
    const ctrl = getController();
    const c = ctrl?.worldCenter() ?? { x: 0, y: 0 };
    const unit = 1 / board.page.camera.z;
    const els = build({ cx: c.x, cy: c.y, unit, color: ui.get().pen.color });
    board.addElements(els);
    // Selected together, so it can be moved or resized as one diagram.
    ui.set({ tool: 'select', selection: new Set(els.map((e) => e.id)) });
    close();
    toast(preset === 'bohr' ? 'Tip: add electrons with the Dot tool (D)' : 'Inserted. Drag a corner to resize');
  };

  if (!mounted) return null;

  const current = PRESETS.find((p) => p.id === preset)!;

  return createPortal(
    <section
      ref={sheet}
      role="dialog"
      aria-label="Elements"
      className={`sheet ${leaving ? 'pop-out' : 'pop-in'} fixed right-4 z-40 flex max-h-[calc(100dvh-96px)] w-[400px] max-w-[calc(100vw-32px)] flex-col overflow-y-auto p-4 max-sm:right-3 max-sm:max-w-[calc(100vw-24px)]`}
      style={{ top: `calc(max(16px, env(safe-area-inset-top)) + ${timerOpen ? 136 : 72}px)`, ['--origin' as string]: '100% 0%' }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) insert();
        const n = Number(e.key);
        if (preset === 'bohr' && n >= 1 && n <= MAX_ENERGY_LEVELS && !(e.target instanceof HTMLInputElement)) setLevels(n);
      }}
    >
      <header className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#34C759] text-white">
          <Icon name="atom" size={20} />
        </span>
        <h2 className="flex-1 text-headline font-semibold tracking-title">Elements</h2>
        <ToolButton icon="close" label="Close" iconSize={12} onClick={close} />
      </header>

      <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none]" role="radiogroup" aria-label="Preset">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={preset === p.id}
            onClick={() => setPreset(p.id)}
            className={`spring flex shrink-0 items-center gap-2.5 rounded-[14px] py-2 pr-4 pl-2.5 text-left ${preset === p.id ? 'bg-tint-soft' : 'bg-fill hover:bg-fill-2'}`}
          >
            <Icon name={p.icon} size={22} className={preset === p.id ? 'text-on-tint-soft' : 'text-label'} />
            <span>
              <span className={`block text-subhead leading-tight font-semibold ${preset === p.id ? 'text-on-tint-soft' : 'text-label'}`}>{p.title}</span>
              <span className={`block text-caption ${preset === p.id ? 'text-on-tint-soft' : 'text-label-2'}`}>{p.detail}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-center rounded-[18px] bg-bg py-3 shadow-[inset_0_0_0_0.5px_var(--hairline)]">
        <ElementsPreview els={previewEls} appearance={appearance} label={`${current.title} preview`} />
      </div>

      {preset === 'bohr' && (
        <>
          <div className="mt-3">
            <Heading title="Energy levels" hint={`Rings around the nucleus · max ${MAX_ENERGY_LEVELS}`} />
            <BubbleGroup active={String(levels)} variant="raised" role="radiogroup" label="Energy levels" className="flex rounded-full bg-fill p-0.5">
              {Array.from({ length: MAX_ENERGY_LEVELS }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={levels === n}
                  aria-label={`${n} energy level${n === 1 ? '' : 's'}`}
                  data-bubble={String(n)}
                  onClick={() => setLevels(n)}
                  className={`spring relative flex h-10 flex-1 items-center justify-center rounded-full text-subhead font-semibold tabular-nums ${levels === n ? 'text-label' : 'text-label-2 hover:text-label'}`}
                >
                  {n}
                </button>
              ))}
            </BubbleGroup>
          </div>
          <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
            <div>
              <p className="text-subhead font-semibold text-label">QMM</p>
              <p className="text-footnote text-label-2">Quantum mechanical model: no P= or N= labels</p>
            </div>
            <Toggle checked={qmm} onChange={setQmm} label="QMM" />
          </div>
        </>
      )}

      {(preset === 'orbital' || preset === 'config') && (
        <>
          <div className="mt-3">
            <Heading title={preset === 'orbital' ? 'Go up to' : 'Fill through'} hint="Subshells in filling order, 1s to 7p" />
            <Chips label="Highest subshell" value={through} options={SUBSHELLS.map((x) => x.id)} onChange={setThrough} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-subhead font-semibold text-label">Electrons</p>
              <p className="text-footnote text-label-2">{preset === 'orbital' ? '0 leaves the boxes empty' : `Up to ${capacity}`}</p>
            </div>
            <Stepper label="Electrons" value={electronCount} min={0} max={capacity} onChange={setElectrons} />
          </div>
        </>
      )}

      {preset === 'lewis' && (
        <>
          <label className="mt-3 flex items-center justify-between gap-3">
            <span className="text-subhead font-semibold text-label">Symbol</span>
            <input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.slice(0, 2))}
              aria-label="Element symbol"
              maxLength={2}
              className="h-9 w-24 rounded-[10px] bg-fill px-3 text-center text-body font-semibold text-label outline-none focus:shadow-[0_0_0_2px_var(--tint)]"
            />
          </label>
          <div className="mt-3">
            <Heading title="Valence electrons" hint={`0 to ${MAX_VALENCE}`} />
            <Chips label="Valence electrons" value={String(valence)} options={Array.from({ length: MAX_VALENCE + 1 }, (_, i) => String(i))} onChange={(v) => setValence(Number(v))} />
          </div>
        </>
      )}

      <footer className="mt-4 flex items-center justify-between gap-3">
        <p className="text-footnote text-label-2 mobile:hidden">{preset === 'bohr' ? `Keys 1–${MAX_ENERGY_LEVELS} · ` : ''}⌘↩ to insert</p>
        <button
          type="button"
          onClick={insert}
          className="spring ml-auto flex h-11 items-center gap-2 rounded-full bg-tint px-5 text-headline font-semibold text-on-tint shadow-[0_4px_14px_var(--tint-glow)] hover:brightness-105 active:scale-[0.97]"
        >
          Insert
        </button>
      </footer>
    </section>,
    document.getElementById('overlay') ?? document.body,
  );
}
