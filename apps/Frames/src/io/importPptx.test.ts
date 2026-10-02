// @vitest-environment jsdom
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { THEME_FRAMES } from '../model/theme';
import type { ImageEl, LineEl, ShapeEl, TextEl } from '../model/types';
import { importPptx } from './importPptx';

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const rels = (items: [string, string, string][]) =>
  `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, t, target]) => `<Relationship Id="${id}" Type="${REL}/${t}" Target="${target}"/>`).join('')}</Relationships>`;

// 1×1 transparent PNG
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

// Slide is 9144000 EMU wide; the target is 1920 → 1 EMU = 1920/9144000 units.
const xfrm = (x: number, y: number, cx: number, cy: number, extra = '') => `<a:xfrm ${extra}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`;

const slide1 = `<?xml version="1.0"?><p:sld ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="112233"/></a:solidFill></p:bgPr></p:bg><p:spTree>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="T"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(914400, 457200, 4572000, 914400)}<a:prstGeom prst="rect"/></p:spPr>
<p:txBody><a:bodyPr/><a:p><a:pPr algn="ctr"/><a:r><a:rPr sz="4000" b="1"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>Hello</a:t></a:r><a:r><a:rPr sz="4000" i="1"/><a:t> world</a:t></a:r></a:p><a:p><a:pPr><a:buChar char="x"/></a:pPr><a:r><a:t>item</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="R"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(0, 0, 914400, 457200, 'rot="5400000"')}<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 50000"/></a:avLst></a:prstGeom><a:solidFill><a:srgbClr val="00FF00"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="0000FF"/></a:solidFill></a:ln></p:spPr></p:sp>
<p:pic><p:nvPicPr><p:cNvPr id="4" name="P" descr="a dot"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/><a:srcRect l="10000" r="10000"/></p:blipFill><p:spPr>${xfrm(1828800, 1828800, 914400, 914400)}</p:spPr></p:pic>
<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="5" name="L"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrm(0, 3000000, 1000000, 500000, 'flipV="1"')}<a:prstGeom prst="line"/><a:ln w="25400"><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:tailEnd type="triangle"/></a:ln></p:spPr></p:cxnSp>
<p:grpSp><p:nvGrpSpPr><p:cNvPr id="6" name="G"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="1000000" y="4000000"/><a:ext cx="2000000" cy="1000000"/><a:chOff x="0" y="0"/><a:chExt cx="1000000" cy="500000"/></a:xfrm></p:grpSpPr>
<p:sp><p:nvSpPr><p:cNvPr id="7" name="C"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(100000, 100000, 200000, 100000)}<a:prstGeom prst="ellipse"/><a:solidFill><a:schemeClr val="accent1"/></a:solidFill></p:spPr></p:sp></p:grpSp>
<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="8" name="Chart"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="0" y="0"/><a:ext cx="1" cy="1"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"/></a:graphic></p:graphicFrame>
</p:spTree></p:cSld><p:timing/></p:sld>`;

const notes = `<?xml version="1.0"?><p:notes ${NS}><p:cSld><p:spTree>
<p:sp><p:nvSpPr><p:cNvPr id="2" name="img"/><p:cNvSpPr/><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>
<p:sp><p:nvSpPr><p:cNvPr id="3" name="body"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:p><a:r><a:t>Say this first.</a:t></a:r></a:p><a:p><a:r><a:t>Then that.</a:t></a:r></a:p></p:txBody></p:sp>
</p:spTree></p:cSld></p:notes>`;

const theme = `<?xml version="1.0"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:themeElements><a:clrScheme name="x"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="222222"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2><a:accent1><a:srgbClr val="FF8800"/></a:accent1></a:clrScheme><a:fontScheme name="f"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`;

function buildPptx(): Uint8Array {
  return zipSync({
    'ppt/presentation.xml': strToU8(`<?xml version="1.0"?><p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>`),
    'ppt/_rels/presentation.xml.rels': strToU8(rels([['rId1', 'slide', 'slides/slide1.xml'], ['rId2', 'slide', 'slides/slide2.xml']])),
    'ppt/slides/slide1.xml': strToU8(slide1),
    'ppt/slides/_rels/slide1.xml.rels': strToU8(rels([['rId2', 'image', '../media/image1.png'], ['rId3', 'notesSlide', '../notesSlides/notesSlide1.xml']])),
    'ppt/slides/slide2.xml': strToU8('<not xml'),
    'ppt/notesSlides/notesSlide1.xml': strToU8(notes),
    'ppt/media/image1.png': PNG,
    'ppt/theme/theme1.xml': strToU8(theme),
    'docProps/core.xml': strToU8('<cp:coreProperties xmlns:cp="x" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>My deck</dc:title></cp:coreProperties>'),
  });
}

describe('importPptx', () => {
  it('imports text, shapes, pictures, lines, groups, notes and warns about the rest', async () => {
    const res = await importPptx(buildPptx(), THEME_FRAMES, { w: 1920, h: 1080 });
    const k = 1920 / 9144000;
    expect(res.title).toBe('My deck');
    expect(res.size).toEqual({ w: 1920, h: 1080 });
    expect(res.slides).toHaveLength(1);

    const s = res.slides[0]!;
    expect(s.background).toEqual({ t: 'solid', c: '#112233' });
    expect(s.notes).toBe('Say this first.\nThen that.');

    const text = s.elements[0] as TextEl;
    expect(text.type).toBe('text');
    expect(text.x).toBeCloseTo(914400 * k, 3);
    expect(text.w).toBeCloseTo(4572000 * k, 3);
    expect(text.base.size).toBeCloseTo(40 * 12700 * k, 3);
    expect(text.base.align).toBe('center');
    expect(text.base.color).toBe('#ff0000');
    expect(text.doc).toHaveLength(2);
    expect(text.doc[0]!.runs.map((r) => r.t).join('')).toBe('Hello world');
    expect(text.doc[0]!.runs[0]).toMatchObject({ b: true });
    expect(text.doc[0]!.runs[1]).toMatchObject({ i: true });
    expect(text.doc[1]!.list).toBe('bullet');
    expect(text.doc[1]!.runs[0]!.size).toBeCloseTo(18 * 12700 * k, 3);

    const rect = s.elements[1] as ShapeEl;
    expect(rect).toMatchObject({ type: 'shape', shape: 'round-rect', rot: 90 });
    expect(rect.fill).toEqual({ t: 'solid', c: '#00ff00' });
    expect(rect.stroke).toMatchObject({ c: '#0000ff' });
    expect(rect.stroke!.w).toBeCloseTo(12700 * k, 3);
    expect(rect.radius).toBeCloseTo(Math.min(rect.w, rect.h) * 0.5, 3);

    const img = s.elements[2] as ImageEl;
    expect(img.type).toBe('image');
    expect(img.alt).toBe('a dot');
    expect(img.crop.x).toBeCloseTo(0.1);
    expect(img.crop.w).toBeCloseTo(0.8);
    expect(res.assets).toHaveLength(1);
    expect(res.assets[0]!.meta).toMatchObject({ id: img.asset, kind: 'image', mime: 'image/png', w: 1, h: 1 });
    expect(res.assets[0]!.blob.type).toBe('image/png');

    const line = s.elements[3] as LineEl;
    expect(line).toMatchObject({ type: 'line', up: true, end: 'triangle', start: 'none' });

    const circle = s.elements[4] as ShapeEl;
    expect(circle.shape).toBe('ellipse');
    expect(circle.x).toBeCloseTo((1000000 + 100000 * 2) * k, 3); // group scale 2×
    expect(circle.w).toBeCloseTo(400000 * k, 3);
    expect(circle.fill).toEqual({ t: 'solid', c: '#ff8800' });

    expect(s.elements).toHaveLength(5);
    expect(res.warnings).toContain('Slide 1: a chart was skipped');
    expect(res.warnings).toContain('Slide 1: animations were skipped');
    expect(res.warnings.some((w) => w.startsWith('Slide 2'))).toBe(true);
  });

  it('rejects non-pptx data', async () => {
    await expect(importPptx(strToU8('nope'), THEME_FRAMES, { w: 1920, h: 1080 })).rejects.toThrow();
  });
});
