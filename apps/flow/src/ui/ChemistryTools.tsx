import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getController } from '../canvas/instance';
import {
  CATEGORY_LABEL, ELEMENTS, SOURCE, chargeText, configFor, lewisElectrons, configText, element, groupLabel, highestSubshell, massText, neutronCount, shellCounts, shorthandConfig, valenceElectrons,
} from '../engine/elements';
import { elementBounds, unionRects } from '../engine/geometry';
import { bohrModel, bohrRadius, elementTile, lewisDot, MAX_SHELLS, orbitalDiagramOf, textLine, type PresetOptions } from '../engine/presets';
import { boardTheme, type Appearance } from '../engine/theme';
import type { BoardElement } from '../engine/types';
import { usePresence } from '../hooks/usePresence';
import { Icon, type IconName } from '../icons/Icon';
import { board } from '../state/board';
import { toast, ui, useUI } from '../state/ui';
import { Toggle, ToolButton } from './controls';
import { Legend, matches, PeriodicTable } from './PeriodicTable';

type TabId = 'table' | 'bohr' | 'orbital' | 'lewis' | 'config';

interface Tab {
  id: TabId;
  icon: IconName;
  title: string;
}

/** The tools in Chemistry Tools. A new one is an entry here plus a builder in engine/presets. */
const TABS: Tab[] = [
  { id: 'table', icon: 'atom', title: 'Periodic Table' },
  { id: 'bohr', icon: 'atom', title: 'Bohr Model' },
  { id: 'orbital', icon: 'atom', title: 'Orbital Diagram' },
  { id: 'lewis', icon: 'atom', title: 'Lewis Dot' },
  { id: 'config', icon: 'atom', title: 'Configuration' },
];

/** Draws preset elements as SVG, so the preview is exactly what gets inserted. */
function ElementsPreview({ els, appearance, label, height = 190 }: { els: BoardElement[]; appearance: Appearance; label: string; height?: number }) {
  const theme = boardTheme(appearance);
  const box = unionRects(els.map(elementBounds)) ?? { x: -50, y: -50, w: 100, h: 100 };
  const pad = 8;
  const vb = `${box.x - pad} ${box.y - pad} ${box.w + pad * 2} ${box.h + pad * 2}`;
  return (
    <svg viewBox={vb} style={{ height }} className="w-full max-w-[360px]" role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
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


const Fact = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 rounded-[12px] bg-fill px-3 py-2">
    <dt className="text-caption text-label-2">{label}</dt>
    <dd className="truncate text-subhead font-semibold text-label tabular-nums" title={value}>{value}</dd>
  </div>
);

/**
 * Chemistry Tools: the periodic table and the chemistry models in one place.
 * One subject (an element, plus an electron count for ions) drives every
 * tool, so changing the element or its electrons updates the Bohr model,
 * orbital diagram, Lewis dot and configuration together. Whatever is
 * inserted is ordinary editable board elements.
 */
export function ChemistryTools({ appearance }: { appearance: Appearance }) {
  const open = useUI((s) => s.chemistryOpen);
  const timerOpen = useUI((s) => s.timerOpen);
  const penColor = useUI((s) => s.pen.color);
  const { mounted, leaving } = usePresence(open);
  const [tab, setTab] = useState<TabId>('table');
  const [z, setZ] = useState(6);
  const [electrons, setElectrons] = useState(6);
  const [qmm, setQmm] = useState(false);
  const [blank, setBlank] = useState(false);
  const [shorthand, setShorthand] = useState(false);
  const [query, setQuery] = useState('');
  const sheet = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => (tab === 'table' ? searchRef.current : sheet.current?.querySelector<HTMLElement>('[aria-checked="true"]'))?.focus());
    // Only on opening: switching tabs keeps the focus where the user put it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const el = element(z)!;
  const counts = useMemo(() => configFor(z, electrons), [z, electrons]);
  const shells = useMemo(() => shellCounts(counts), [counts]);
  const valence = lewisElectrons(z, electrons);
  const charge = z - electrons;
  const label = `${el.symbol}${chargeText(charge)}`;

  /** Choosing another element resets to its neutral atom. */
  const pick = (next: number) => {
    const n = Math.min(Math.max(next, 1), ELEMENTS.length);
    setZ(n);
    setElectrons(n);
  };

  const build = (o: PresetOptions): BoardElement[] => {
    switch (tab) {
      case 'table': return elementTile({ z: el.z, symbol: el.symbol, name: el.name, mass: massText(el) }, o);
      case 'bohr':
        return blank
          ? bohrModel(shells.length, o, { qmm, shells: shells.map(() => 0) })
          : bohrModel(shells.length, o, { qmm, shells, protons: el.z, neutrons: neutronCount(el) });
      case 'orbital': return orbitalDiagramOf(highestSubshell(counts), blank ? new Map() : counts, o);
      case 'lewis': return lewisDot(el.symbol, blank ? 0 : valence, o, blank ? '' : chargeText(charge));
      case 'config': return textLine(blank ? [...counts].filter(([, k]) => k > 0).map(([id]) => `${id}_`).join(' ') : shorthand ? shorthandConfig(z, counts) : configText(counts), o);
    }
  };
  const previewEls = useMemo(
    () => build({ cx: 0, cy: 0, unit: 1, color: penColor }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, z, electrons, qmm, blank, shorthand, penColor],
  );

  const close = () => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && sheet.current?.contains(active)) active.blur();
    ui.set({ chemistryOpen: false });
  };

  const insert = () => {
    const ctrl = getController();
    const c = ctrl?.worldCenter() ?? { x: 0, y: 0 };
    let unit = 1 / board.page.camera.z;
    // Seven-ring atoms would cover the screen: fit the model to a readable size.
    if (tab === 'bohr' && shells.length > 5) unit *= (bohrRadius(5)) / bohrRadius(shells.length, MAX_SHELLS);
    const els = build({ cx: c.x, cy: c.y, unit, color: ui.get().pen.color });
    board.addElements(els);
    // Selected together, so it can be moved or resized as one diagram.
    ui.set({ tool: 'select', selection: new Set(els.map((e) => e.id)) });
    close();
    toast(tab === 'bohr' && blank ? 'Tip: add electrons with the Dot tool (D)' : 'Inserted. Drag a corner to resize');
  };

  if (!mounted) return null;

  const wide = tab === 'table';
  const matched = ELEMENTS.filter((e) => matches(e, query));
  const full = configText(counts);

  return createPortal(
    <section
      ref={sheet}
      role="dialog"
      aria-label="Chemistry Tools"
      className={`sheet ${leaving ? 'pop-out' : 'pop-in'} fixed right-4 z-40 flex max-h-[calc(100dvh-96px)] max-w-[calc(100vw-32px)] flex-col overflow-y-auto p-4 [&>*]:shrink-0 max-sm:right-3 max-sm:max-w-[calc(100vw-24px)] ${wide ? 'w-[860px]' : 'w-[420px]'}`}
      style={{ top: `calc(max(16px, env(safe-area-inset-top)) + ${timerOpen ? 136 : 72}px)`, ['--origin' as string]: '100% 0%', transition: 'width 280ms var(--spring)' }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) insert();
      }}
    >
      <header className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#34C759] text-white">
          <Icon name="atom" size={20} />
        </span>
        <h2 className="flex-1 text-headline font-semibold tracking-title">Chemistry Tools</h2>
        <ToolButton icon="close" label="Close" iconSize={12} onClick={close} />
      </header>

      <div className="mt-3 flex gap-1.5 overflow-x-auto [scrollbar-width:none]" role="radiogroup" aria-label="Tool">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`spring h-10 shrink-0 rounded-full px-4 text-subhead font-semibold ${tab === t.id ? 'bg-tint-soft text-on-tint-soft' : 'bg-fill text-label hover:bg-fill-2'}`}
          >
            {t.title}
          </button>
        ))}
      </div>

      {tab === 'table' ? (
        <>
          <div className="mt-3 flex items-center gap-3">
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && matched[0]) {
                  e.preventDefault();
                  e.stopPropagation();
                  pick(matched[0].z);
                }
              }}
              placeholder="Search by name, symbol or number"
              aria-label="Search the periodic table"
              className="h-10 min-w-0 flex-1 rounded-full bg-fill px-4 text-body text-label outline-none placeholder:text-label-3 focus:shadow-[0_0_0_2px_var(--tint)]"
            />
            <p className="text-footnote text-label-2 tabular-nums" aria-live="polite">{query.trim() ? `${matched.length} match${matched.length === 1 ? '' : 'es'}` : '118 elements'}</p>
          </div>
          <div className="mt-3">
            <PeriodicTable selected={z} onSelect={pick} query={query} />
            <Legend />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-[auto_1fr]" aria-live="polite">
            <div className="flex items-center justify-center rounded-[18px] bg-bg px-3 py-2 shadow-[inset_0_0_0_0.5px_var(--hairline)]">
              <ElementsPreview els={previewEls} appearance={appearance} label={`${el.name} tile preview`} height={150} />
            </div>
            <div className="min-w-0">
              <h3 className="text-title3 font-semibold tracking-title text-label">
                {el.name} <span className="text-label-2">· {el.symbol}</span>
              </h3>
              <dl className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                <Fact label="Atomic number" value={String(el.z)} />
                <Fact label={el.massIsIsotope ? 'Mass (most stable isotope)' : 'Average atomic mass'} value={massText(el)} />
                <Fact label="Group · Period" value={`${el.group === null ? '—' : `${el.group} (${groupLabel(el.group)})`} · ${el.period}`} />
                <Fact label="Category" value={CATEGORY_LABEL[el.category]} />
                <Fact label="Energy levels" value={shellCounts(configFor(el.z, el.z)).join(', ')} />
                <Fact label="Valence electrons" value={String(valenceElectrons(configFor(el.z, el.z)))} />
              </dl>
              <p className="mt-2 text-subhead text-label">
                <span className="text-label-2">Configuration </span>
                <span className="font-semibold">{configText(configFor(el.z, el.z))}</span>
              </p>
              <p className="text-footnote text-label-2">Shorthand {shorthandConfig(el.z, configFor(el.z, el.z))}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(['bohr', 'orbital', 'lewis', 'config'] as const).map((id) => (
                  <button key={id} type="button" onClick={() => setTab(id)} className="spring h-9 rounded-full bg-fill px-3.5 text-subhead font-semibold text-label hover:bg-fill-2">
                    {TABS.find((t) => t.id === id)!.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* The one subject every tool draws. */}
          <div className="mt-3 flex items-center gap-2 rounded-[14px] bg-fill px-2 py-1.5" role="group" aria-label="Element">
            <button type="button" className="spring flex h-9 w-9 items-center justify-center rounded-full bg-fill text-headline hover:bg-fill-2 disabled:opacity-40" aria-label="Previous element" disabled={z <= 1} onClick={() => pick(z - 1)}>‹</button>
            <button type="button" onClick={() => setTab('table')} className="spring min-w-0 flex-1 rounded-[10px] px-2 py-1 text-left hover:bg-fill-2" title="Choose from the periodic table">
              <span className="block truncate text-headline font-semibold text-label">{label} · {el.name}</span>
              <span className="block text-caption text-label-2">Atomic number {el.z} · {charge === 0 ? 'neutral atom' : `ion ${charge > 0 ? '+' : '−'}${Math.abs(charge)}`}</span>
            </button>
            <button type="button" className="spring flex h-9 w-9 items-center justify-center rounded-full bg-fill text-headline hover:bg-fill-2 disabled:opacity-40" aria-label="Next element" disabled={z >= ELEMENTS.length} onClick={() => pick(z + 1)}>›</button>
          </div>

          <div className="mt-3 flex items-center justify-center rounded-[18px] bg-bg py-3 shadow-[inset_0_0_0_0.5px_var(--hairline)]">
            <ElementsPreview els={previewEls} appearance={appearance} label={`${TABS.find((t) => t.id === tab)!.title} preview`} height={tab === 'orbital' ? 260 : 190} />
          </div>

          <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
            <div>
              <p className="text-subhead font-semibold text-label">Electrons</p>
              <p className="text-footnote text-label-2">{charge === 0 ? 'Neutral atom' : `${label}: ${Math.abs(charge)} ${charge > 0 ? 'lost' : 'gained'}`} · updates every tool</p>
            </div>
            <Stepper label="Electrons" value={electrons} min={0} max={118} onChange={setElectrons} />
          </div>

          <p className="mt-1 text-footnote text-label-2 tabular-nums" aria-live="polite">
            {shells.join(' · ') || '0'} electrons per level · {valence} valence · {shorthandConfig(z, counts) || '—'}
          </p>

          {tab === 'bohr' && (
            <div className="mt-2 flex min-h-11 items-center justify-between gap-3">
              <div>
                <p className="text-subhead font-semibold text-label">QMM</p>
                <p className="text-footnote text-label-2">Quantum mechanical model: no p= or n= labels, no electrons on orbits</p>
              </div>
              <Toggle checked={qmm} onChange={setQmm} label="QMM" />
            </div>
          )}
          {tab === 'config' && (
            <div className="mt-2 flex min-h-11 items-center justify-between gap-3">
              <div>
                <p className="text-subhead font-semibold text-label">Noble-gas shorthand</p>
                <p className="text-footnote text-label-2">{full}</p>
              </div>
              <Toggle checked={shorthand} onChange={setShorthand} label="Noble-gas shorthand" />
            </div>
          )}
          <div className="mt-2 flex min-h-11 items-center justify-between gap-3">
            <div>
              <p className="text-subhead font-semibold text-label">Blank worksheet</p>
              <p className="text-footnote text-label-2">Draw the empty template for a student to fill in</p>
            </div>
            <Toggle checked={blank} onChange={setBlank} label="Blank worksheet" />
          </div>
        </>
      )}

      <footer className="mt-4 flex items-center justify-between gap-3">
        <p className="text-footnote text-label-2 mobile:hidden">{tab === 'table' ? 'Arrow keys move around the table · ' : ''}⌘↩ to insert</p>
        <button
          type="button"
          onClick={insert}
          className="spring ml-auto flex h-11 items-center gap-2 rounded-full bg-tint px-5 text-headline font-semibold text-on-tint shadow-[0_4px_14px_var(--tint-glow)] hover:brightness-105 active:scale-[0.97]"
        >
          {tab === 'table' ? `Insert ${el.symbol} tile` : 'Insert'}
        </button>
      </footer>
      {tab === 'table' && <p className="mt-2 text-caption text-label-3">Source: {SOURCE}. A mass in parentheses is the most stable isotope.</p>}
    </section>,
    document.getElementById('overlay') ?? document.body,
  );
}
