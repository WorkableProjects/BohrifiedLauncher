/**
 * LaTeX → self-contained SVG via MathJax (TeX input, SVG output).
 *
 * Glyphs come out as <path>s, so the result needs no web fonts: it can be
 * stored in the document, drawn on the canvas, synced to the student view
 * and exported without MathJax being loaded there. MathJax itself is
 * loaded on demand the first time the equation sheet opens.
 */

export interface TypesetResult {
  /** SVG markup with fill="currentColor" and px dimensions at `EM_PX` per em. */
  svg: string;
  /** Size in ems (MathJax units are 1/1000 em). */
  wEm: number;
  hEm: number;
}

/** Intrinsic px per em written into the SVG (drawing always scales it). */
export const EM_PX = 64;

type Convert = (tex: string) => TypesetResult;

let loader: Promise<Convert> | null = null;

export function loadTex(): Promise<Convert> {
  loader ??= (async () => {
    const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }, { AllPackages }] = await Promise.all([
      import('mathjax-full/js/mathjax.js'),
      import('mathjax-full/js/input/tex.js'),
      import('mathjax-full/js/output/svg.js'),
      import('mathjax-full/js/adaptors/liteAdaptor.js'),
      import('mathjax-full/js/handlers/html.js'),
      import('mathjax-full/js/input/tex/AllPackages.js'),
    ]);
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    // Errors should surface to the author, not render as red boxes on the board.
    const packages = AllPackages.filter((p: string) => !['noerrors', 'noundefined', 'bussproofs', 'require', 'autoload'].includes(p));
    const doc = mathjax.document('', {
      InputJax: new TeX({ packages, formatError: (_jax: unknown, err: Error) => { throw err; } }),
      OutputJax: new SVG({ fontCache: 'none' }),
    });
    return (tex: string) => {
      const node = doc.convert(tex, { display: true });
      const svgNode = adaptor.firstChild(node) as never;
      const raw: string = adaptor.outerHTML(svgNode);
      const vb = raw.match(/viewBox="([-\d.\s]+)"/)?.[1].trim().split(/\s+/).map(Number);
      if (!vb || vb.length !== 4) throw new Error('Could not typeset that equation');
      const wEm = vb[2] / 1000;
      const hEm = vb[3] / 1000;
      const svg = raw
        .replace(/\sstyle="[^"]*"/, '')
        .replace(/\swidth="[^"]*"/, ` width="${(wEm * EM_PX).toFixed(2)}px"`)
        .replace(/\sheight="[^"]*"/, ` height="${(hEm * EM_PX).toFixed(2)}px"`)
        .replace(/\srole="img"/, '')
        .replace(/\sfocusable="false"/, '');
      return { svg, wEm, hEm };
    };
  })();
  loader.catch(() => (loader = null));
  return loader;
}

export async function typeset(tex: string): Promise<TypesetResult | { error: string }> {
  const source = tex.trim();
  if (!source) return { error: '' };
  try {
    const convert = await loadTex();
    return convert(source);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
