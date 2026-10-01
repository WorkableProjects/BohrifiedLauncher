/**
 * The token names in tokens.css, for code that needs them (tests, JS that
 * sets one inline). The CSS file is the source of truth; `tokens.test.ts`
 * checks that this list and the CSS agree.
 */

/** Semantic colour roles. */
export const COLOR_ROLES = ['label', 'label-2', 'label-3', 'background', 'background-2', 'separator', 'tint', 'tint-contrast', 'danger', 'success', 'fill', 'fill-2'] as const;

/** Semantic text styles (also available as `.t-<name>` classes). */
export const TEXT_STYLES = ['display', 'large-title', 'title-1', 'title-2', 'title-3', 'headline', 'body', 'callout', 'subhead', 'footnote', 'caption'] as const;

/** The 4 pt spacing steps. */
export const SPACING = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48 } as const;

/** Minimum interactive target, in px. */
export const MIN_TARGET = 44;

/** Text size choices for the Text size setting. */
export const TEXT_SCALES = { default: 1, large: 1.15, larger: 1.3 } as const;
export type TextSize = keyof typeof TEXT_SCALES;
export const isTextSize = (v: unknown): v is TextSize => typeof v === 'string' && v in TEXT_SCALES;

/** Radius of an element inset `inset` px inside a container with radius `outer`: concentric corners. */
export const concentricRadius = (outer: number, inset: number) => Math.max(0, outer - inset);

/** Apply the text-size setting to the document. */
export function applyTextSize(size: TextSize, root: HTMLElement = document.documentElement) {
  root.style.setProperty('--text-scale', String(TEXT_SCALES[size]));
}
