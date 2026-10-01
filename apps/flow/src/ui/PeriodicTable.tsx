import { useMemo, useRef, type KeyboardEvent } from 'react';
import { CATEGORY_LABEL, ELEMENTS, massText, type ChemElement, type ElementCategory } from '../engine/elements';

/** One hue per category; the cell tint mixes it into the page background so both themes stay readable. */
export const CATEGORY_HUE: Record<ElementCategory, string> = {
  'alkali-metal': '#ff6b4a',
  'alkaline-earth-metal': '#ff9f0a',
  'transition-metal': '#4f8cff',
  'post-transition-metal': '#2bb3a3',
  metalloid: '#7bc043',
  nonmetal: '#a56cf0',
  halogen: '#e8559f',
  'noble-gas': '#27b6d9',
  lanthanide: '#c58a2f',
  actinide: '#8e8e93',
};

interface Cell {
  el: ChemElement;
  row: number;
  col: number;
}

/** Cells laid out as on the California reference sheet: groups across, periods down, f-block rows below. */
export const CELLS: readonly Cell[] = ELEMENTS.map((el) => {
  if (el.group !== null) return { el, row: el.period, col: el.group };
  // Lanthanides (58–71) and actinides (90–103) sit in two rows under the table, starting beneath column 5.
  const first = el.period === 6 ? 58 : 90;
  return { el, row: el.period === 6 ? 9 : 10, col: 5 + (el.z - first) };
});

const key = (row: number, col: number) => row * 100 + col;
const BY_POS = new Map(CELLS.map((c) => [key(c.row, c.col), c]));

/** True when the element matches a search ("fe", "iron", "26"). */
export function matches(el: ChemElement, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return el.symbol.toLowerCase().startsWith(q) || el.name.toLowerCase().includes(q) || String(el.z) === q || CATEGORY_LABEL[el.category].toLowerCase().includes(q);
}

/** The neighbouring cell in a direction, skipping gaps (row 8, empty corners). */
function neighbour(from: Cell, dr: number, dc: number): Cell | null {
  let row = from.row;
  let col = from.col;
  for (let i = 0; i < 20; i++) {
    row += dr;
    col += dc;
    if (row < 1 || row > 10 || col < 1 || col > 18) return null;
    const hit = BY_POS.get(key(row, col));
    if (hit) return hit;
    // Moving sideways, an empty cell ends the row; vertically, keep looking past the gap.
    if (dc) return null;
  }
  return null;
}

export function PeriodicTable({ selected, onSelect, query }: { selected: number; onSelect: (z: number) => void; query: string }) {
  const grid = useRef<HTMLDivElement>(null);
  const hits = useMemo(() => new Set(ELEMENTS.filter((e) => matches(e, query)).map((e) => e.z)), [query]);

  const onKey = (e: KeyboardEvent, cell: Cell) => {
    const d = ({ ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] } as Record<string, [number, number]>)[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    const next = neighbour(cell, d[0], d[1]);
    if (!next) return;
    onSelect(next.el.z);
    requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-z="${next.el.z}"]`)?.focus());
  };

  return (
    <div className="overflow-x-auto pb-1 [scrollbar-width:thin]">
      <div
        ref={grid}
        role="group"
        aria-label="Periodic table of the elements"
        className="grid min-w-[760px] gap-[3px]"
        style={{ gridTemplateColumns: 'repeat(18, minmax(0, 1fr))', gridTemplateRows: 'repeat(7, 40px) 8px repeat(2, 40px)' }}
      >
        {CELLS.map(({ el, row, col }) => {
          const on = el.z === selected;
          const dim = !hits.has(el.z);
          return (
            <button
              key={el.z}
              type="button"
              data-z={el.z}
              aria-pressed={on}
              aria-label={`${el.name}, atomic number ${el.z}, ${CATEGORY_LABEL[el.category]}`}
              tabIndex={on ? 0 : -1}
              onClick={() => onSelect(el.z)}
              onKeyDown={(e) => onKey(e, { el, row, col })}
              style={{
                gridRow: row,
                gridColumn: col,
                background: `color-mix(in srgb, ${CATEGORY_HUE[el.category]} ${on ? 55 : 24}%, var(--bg))`,
                opacity: dim ? 0.25 : 1,
              }}
              className={`spring flex min-w-0 flex-col items-center justify-center rounded-[7px] leading-none outline-none ${on ? 'shadow-[0_0_0_2px_var(--tint)]' : 'hover:brightness-110'}`}
            >
              <span className="text-[9px] text-label-2 tabular-nums">{el.z}</span>
              <span className="mt-0.5 text-[15px] font-bold text-label">{el.symbol}</span>
            </button>
          );
        })}
        {/* The sheet's key for the two f-block rows. */}
        <span aria-hidden className="self-center text-[10px] leading-tight text-label-2" style={{ gridRow: '9 / 11', gridColumn: '1 / 5', paddingRight: 6, textAlign: 'right' }}>
          Lanthanides<br />Actinides
        </span>
      </div>
    </div>
  );
}

export function Legend() {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1" aria-label="Categories">
      {(Object.keys(CATEGORY_HUE) as ElementCategory[]).map((c) => (
        <li key={c} className="flex items-center gap-1.5 text-caption text-label-2">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: CATEGORY_HUE[c] }} />
          {CATEGORY_LABEL[c]}
        </li>
      ))}
    </ul>
  );
}

export { massText };
