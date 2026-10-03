import { describe, expect, it } from 'vitest';
import { ICON_GROUPS, ICON_KEYWORDS, ICONS, iconPaths } from './icons';

const ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
const TOKEN = /\s*,?\s*(?:([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?))/y;

/** Strict validator: only known commands and numbers, correct arg counts, starts with M. */
function validate(d: string): string | null {
  if (!d.startsWith('M')) return 'must start with M';
  TOKEN.lastIndex = 0;
  let pos = 0;
  let cmd = '';
  let count = 0;
  const finish = (): string | null => {
    const need = ARGS[cmd.toLowerCase()]!;
    if (need === 0) return count === 0 ? null : 'Z takes no args';
    return count > 0 && count % need === 0 ? null : `${cmd} got ${count} args`;
  };
  while (pos < d.length) {
    TOKEN.lastIndex = pos;
    const m = TOKEN.exec(d);
    if (!m) return `bad token at ${pos}: ${d.slice(pos, pos + 8)}`;
    pos = TOKEN.lastIndex;
    if (m[1]) {
      if (cmd) {
        const err = finish();
        if (err) return err;
      }
      cmd = m[1];
      count = 0;
    } else {
      if (!cmd) return 'number before command';
      count++;
    }
  }
  return cmd ? finish() : 'empty';
}

const REQUIRED = `cursor undo redo plus minus type image shapes line film table chart arrange sparkles play pause present download upload trash copy paste lock unlock eye eye-off align-left align-center align-right align-justify align-top align-middle align-bottom distribute-h distribute-v group ungroup bring-front bring-forward send-backward send-back chevron-left chevron-right chevron-up chevron-down x check settings grid ruler zoom-in zoom-out fit bold italic underline strikethrough superscript subscript list list-ordered link highlighter droplet crop mask corner folder file layers slides timeline keyframe skip-back skip-forward timer notes monitor fullscreen blank camera mouse-pointer hand move rotate flip-h flip-v search more star heart duplicate template palette brush wand magnet guides safe-area text-box music volume sliders export import bookmark section share keyboard info alert history
arrow-right arrow-left arrow-up arrow-down user users mail globe rocket bolt bulb trophy target shield cloud sun moon phone calendar clock map-pin trending-up trending-down dollar code cpu database key flag gift home bell mic wifi battery bag cart coffee book pen scissors wrench puzzle compass anchor award briefcase crown flame leaf zap smile thumbs-up message send share-2 pie-chart bar-chart activity layers-2 box truck plane car tv headphones gamepad medal swords crosshair radio signal`.split(/\s+/);

describe('icons', () => {
  it('has every required icon', () => {
    expect(REQUIRED.filter((n) => !(n in ICONS))).toEqual([]);
    expect(Object.keys(ICONS).length).toBeGreaterThanOrEqual(140);
  });

  it('every path is strictly valid', () => {
    const bad: string[] = [];
    for (const [name, paths] of Object.entries(ICONS)) {
      expect(paths.length, name).toBeGreaterThan(0);
      for (const d of paths) {
        const err = validate(d);
        if (err) bad.push(`${name}: ${err} :: ${d.slice(0, 60)}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the validator rejects junk', () => {
    expect(validate('M1 2 3')).not.toBeNull();
    expect(validate('L1 2')).not.toBeNull();
    expect(validate('M1 2X')).not.toBeNull();
    expect(validate('M1 2L3')).not.toBeNull();
    expect(validate('M1 2h3z')).toBeNull();
  });

  it('picker metadata references real icons', () => {
    for (const g of ICON_GROUPS) for (const i of g.icons) expect(ICONS[i], i).toBeDefined();
    for (const k of Object.keys(ICON_KEYWORDS)) expect(ICONS[k], k).toBeDefined();
    expect(iconPaths('nope')).toEqual([]);
  });
});
