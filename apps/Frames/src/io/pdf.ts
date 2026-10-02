/** A minimal PDF 1.4 writer: one full-page JPEG per page. No dependencies. */

export interface PdfPage {
  jpeg: Uint8Array;
  /** Pixel size of the JPEG. */
  w: number;
  h: number;
  /** Page size in PDF points; defaults to 0.75 × pixels (96 dpi). */
  pageW?: number;
  pageH?: number;
}

const enc = new TextEncoder();

/** Escape a string for a PDF literal string; non-Latin-1 text is written as UTF-16BE hex. */
export function pdfString(s: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(s)) return '(' + s.replace(/[\\()]/g, '\\$&') + ')';
  let hex = 'FEFF';
  for (let i = 0; i < s.length; i++) hex += s.charCodeAt(i).toString(16).padStart(4, '0');
  return `<${hex.toUpperCase()}>`;
}

const num = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : '0');

function pdfDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

export function buildPdf(pages: PdfPage[], opts: { title?: string; author?: string } = {}): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (b: Uint8Array | string) => {
    const u = typeof b === 'string' ? enc.encode(b) : b;
    chunks.push(u);
    pos += u.length;
  };
  const obj = (n: number, body: string) => {
    offsets[n] = pos;
    push(`${n} 0 obj\n${body}\nendobj\n`);
  };

  // Object numbering: 1 catalog, 2 page tree, 3 info, then (page, content, image) per page.
  const pageObj = (i: number) => 4 + i * 3;
  // The high-bit comment tells transfer tools the file is binary.
  push(new Uint8Array([...enc.encode('%PDF-1.4\n%'), 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>`);
  const info = [`/Producer ${pdfString('Frames')}`, `/CreationDate (${pdfDate()})`];
  if (opts.title) info.push(`/Title ${pdfString(opts.title)}`);
  if (opts.author) info.push(`/Author ${pdfString(opts.author)}`);
  obj(3, `<< ${info.join(' ')} >>`);

  pages.forEach((pg, i) => {
    const pw = pg.pageW ?? pg.w * 0.75;
    const ph = pg.pageH ?? pg.h * 0.75;
    const n = pageObj(i);
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pw)} ${num(ph)}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ${n + 1} 0 R >>`);
    const content = `q ${num(pw)} 0 0 ${num(ph)} 0 0 cm /Im0 Do Q`;
    obj(n + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    offsets[n + 2] = pos;
    push(`${n + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.round(pg.w)} /Height ${Math.round(pg.h)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`);
    push(pg.jpeg);
    push('\nendstream\nendobj\n');
  });

  const count = 3 + pages.length * 3 + 1;
  const xref = pos;
  let table = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) table += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(pos);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
