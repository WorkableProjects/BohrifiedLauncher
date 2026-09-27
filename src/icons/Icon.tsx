import { memo } from 'react';
import { symbols, type IconName } from './symbols';

interface IconProps {
  name: IconName;
  /** Rendered box size in px (glyph is centred and fitted inside). */
  size?: number;
  className?: string;
  title?: string;
}

/**
 * SF Symbol glyph rendered as inline SVG in currentColor, so icon weight
 * and color follow the adjacent text.
 */
export const Icon = memo(function Icon({ name, size = 22, className, title }: IconProps) {
  const g = symbols[name];
  const [x, y, w, h] = g.vb;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`${x} ${y} ${w} ${h}`}
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      style={{ overflow: 'visible', flexShrink: 0 }}
    >
      {title && <title>{title}</title>}
      <g transform={`scale(1,-1) translate(0,-${g.h})`}>
        <path d={g.d} fill="currentColor" />
      </g>
    </svg>
  );
});

export type { IconName };
