import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getController } from '../canvas/instance';
import { BOHR, bohrModel, bohrRadius, MAX_ENERGY_LEVELS } from '../engine/presets';
import { swatch, type Appearance } from '../engine/theme';
import { usePresence } from '../hooks/usePresence';
import { Icon, type IconName } from '../icons/Icon';
import { board } from '../state/board';
import { toast, ui, useUI } from '../state/ui';
import { BubbleGroup } from './Bubble';
import { ToolButton } from './controls';

interface Preset {
  id: 'bohr';
  icon: IconName;
  title: string;
  detail: string;
}

/** Presets offered by Elements. New resources are an entry here plus a builder in engine/presets. */
const PRESETS: Preset[] = [{ id: 'bohr', icon: 'atom', title: 'Bohr Model', detail: 'Nucleus and energy levels' }];

/** Live preview drawn with the same measurements as the board version. */
function BohrPreview({ levels, color }: { levels: number; color: string }) {
  const r = bohrRadius(levels) + BOHR.stroke;
  const x = -BOHR.nucleus * 0.5;
  return (
    <svg viewBox={`${-r} ${-r} ${r * 2} ${r * 2}`} className="h-[190px] w-[190px]" role="img" aria-label={`Bohr model with ${levels} energy level${levels === 1 ? '' : 's'}`}>
      {Array.from({ length: levels + 1 }, (_, k) => (
        <circle
          key={k}
          r={BOHR.nucleus + k * BOHR.gap}
          fill="none"
          stroke={color}
          strokeWidth={BOHR.stroke}
          className="fade-in"
        />
      ))}
      <g fill={color} fontWeight={700} fontSize={BOHR.label} fontFamily="var(--font)">
        <text x={x} y={-BOHR.label * 0.25}>p =</text>
        <text x={x} y={BOHR.label * 1.2}>n =</text>
      </g>
    </svg>
  );
}

/**
 * Elements: chemistry and physics resources in a few clicks. Pick a preset,
 * adjust it, and drop it on the board as ordinary editable elements.
 */
export function ElementsSheet({ appearance }: { appearance: Appearance }) {
  const open = useUI((s) => s.elementsOpen);
  const timerOpen = useUI((s) => s.timerOpen);
  const { mounted, leaving } = usePresence(open);
  const [preset, setPreset] = useState<Preset['id']>('bohr');
  const [levels, setLevels] = useState(2);
  const sheet = useRef<HTMLElement>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => sheet.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
  }, [open]);

  const close = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && sheet.current?.contains(active)) active.blur();
    ui.set({ elementsOpen: false });
  };

  const insert = () => {
    const ctrl = getController();
    const c = ctrl?.worldCenter() ?? { x: 0, y: 0 };
    const unit = 1 / board.page.camera.z;
    const els = bohrModel(levels, { cx: c.x, cy: c.y, unit, color: ui.get().pen.color });
    board.addElements(els);
    // Selected together, so it can be moved or resized as one diagram.
    ui.set({ tool: 'select', selection: new Set(els.map((e) => e.id)) });
    close();
    toast('Tip: add electrons with the Dot tool (D)');
  };

  if (!mounted) return null;

  return createPortal(
    <section
      ref={sheet}
      role="dialog"
      aria-label="Elements"
      className={`sheet ${leaving ? 'pop-out' : 'pop-in'} fixed right-4 z-40 flex w-[400px] max-w-[calc(100vw-32px)] flex-col p-4 max-sm:right-3 max-sm:max-w-[calc(100vw-24px)]`}
      style={{ top: `calc(max(16px, env(safe-area-inset-top)) + ${timerOpen ? 136 : 72}px)`, ['--origin' as string]: '100% 0%' }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) insert();
        const n = Number(e.key);
        if (n >= 1 && n <= MAX_ENERGY_LEVELS) setLevels(n);
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
        <BohrPreview levels={levels} color={swatch(ui.get().pen.color, appearance)} />
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-subhead font-semibold text-label">Energy levels</span>
          <span className="text-footnote text-label-2">Rings around the nucleus · max {MAX_ENERGY_LEVELS}</span>
        </div>
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

      <footer className="mt-4 flex items-center justify-between gap-3">
        <p className="text-footnote text-label-2 mobile:hidden">Keys 1–{MAX_ENERGY_LEVELS} · ⌘↩ to insert</p>
        <button
          type="button"
          onClick={insert}
          className="spring ml-auto flex h-11 items-center gap-2 rounded-full bg-tint px-5 text-headline font-semibold text-white shadow-[0_4px_14px_var(--tint-glow)] hover:brightness-105 active:scale-[0.97]"
        >
          Insert
        </button>
      </footer>
    </section>,
    document.getElementById('overlay') ?? document.body,
  );
}
