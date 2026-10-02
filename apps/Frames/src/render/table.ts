import { resolveColor } from '../model/theme';
import type { DesignSystem, RichDoc, TableCell, TableEl } from '../model/types';
import { dashPattern } from './lines';
import { layoutText, paintLayout, type PaintTextOpts } from './text';

const docs = new WeakMap<TableCell, RichDoc>();
export function cellDoc(c: TableCell): RichDoc {
  let d = docs.get(c);
  if (!d) {
    d = c.t.split('\n').map((line) => ({ runs: [{ t: line, ...(c.b ? { b: true } : {}), ...(c.i ? { i: true } : {}), ...(c.c ? { c: c.c } : {}) }], ...(c.align ? { align: c.align } : {}) }));
    docs.set(c, d);
  }
  return d;
}

export function cellRect(el: Pick<TableEl, 'cols' | 'rows'>, r: number, c: number) {
  let x = 0, y = 0;
  for (let i = 0; i < c; i++) x += el.cols[i] ?? 0;
  for (let i = 0; i < r; i++) y += el.rows[i] ?? 0;
  return { x, y, w: el.cols[c] ?? 0, h: el.rows[r] ?? 0 };
}

export function cellAt(el: Pick<TableEl, 'cols' | 'rows'>, px: number, py: number): { r: number; c: number } | null {
  let x = 0, c = -1;
  for (let i = 0; i < el.cols.length; i++) {
    if (px >= x && px < x + el.cols[i]!) { c = i; break; }
    x += el.cols[i]!;
  }
  let y = 0, r = -1;
  for (let i = 0; i < el.rows.length; i++) {
    if (py >= y && py < y + el.rows[i]!) { r = i; break; }
    y += el.rows[i]!;
  }
  return r >= 0 && c >= 0 ? { r, c } : null;
}

/** Draw a table in its own box. `skip` is a cell being edited (its text is drawn by the editor overlay). */
export function drawTable(ctx: CanvasRenderingContext2D, el: TableEl, theme: DesignSystem, o: PaintTextOpts & { skip?: { r: number; c: number } | null } = {}) {
  const border = resolveColor(theme, el.border.c);
  let y = 0;
  for (let r = 0; r < el.rows.length; r++) {
    let x = 0;
    const rh = el.rows[r]!;
    for (let c = 0; c < el.cols.length; c++) {
      const cw = el.cols[c]!;
      const cell = el.cells[r]?.[c] ?? { t: '' };
      const head = el.header && r === 0;
      const fill = cell.fill ?? (head ? el.headerFill : el.banded && (el.header ? r % 2 === 0 : r % 2 === 1) ? el.bandFill : null);
      if (fill) {
        ctx.fillStyle = resolveColor(theme, fill);
        ctx.fillRect(x, y, cw, rh);
      }
      if (!(o.skip && o.skip.r === r && o.skip.c === c) && cell.t) {
        const base = head ? { ...el.base, weight: Math.max(el.base.weight, 700), color: cell.c ?? '#ffffff' } : el.base;
        const doc = head && !cell.c ? cellDoc({ ...cell, b: true, c: '#ffffff' }) : cellDoc(cell);
        const layout = layoutText(doc, base, theme, Math.max(10, cw - el.pad * 2));
        paintLayout(ctx, layout, theme, x + el.pad, y + Math.max(el.pad * 0.5, (rh - layout.height) / 2), o);
      }
      x += cw;
    }
    y += rh;
  }
  // Grid lines.
  ctx.strokeStyle = border;
  ctx.lineWidth = el.border.w;
  ctx.setLineDash(dashPattern(el.border.dash, el.border.w));
  ctx.beginPath();
  let gy = 0;
  for (let r = 0; r <= el.rows.length; r++) {
    ctx.moveTo(0, gy);
    ctx.lineTo(sum(el.cols), gy);
    gy += el.rows[r] ?? 0;
  }
  let gx = 0;
  for (let c = 0; c <= el.cols.length; c++) {
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, sum(el.rows));
    gx += el.cols[c] ?? 0;
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
