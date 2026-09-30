import { forwardRef, useCallback, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { useGlass } from './GlassProvider';

interface GlassProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Corner radius in px — also fed to the WebGL shader so the bevel matches. */
  radius?: number;
  style?: CSSProperties;
}

/**
 * A floating Liquid Glass surface. Must be rendered as a direct child of
 * the stage so the WebGL renderer can adopt it; always carries a CSS
 * frosted-glass fallback.
 */
export const Glass = forwardRef<HTMLDivElement, GlassProps>(function Glass({ children, radius = 26, className = '', style, ...rest }, forwarded) {
  const { register } = useGlass();
  const cleanup = useRef<(() => void) | null>(null);

  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      cleanup.current?.();
      cleanup.current = el ? register(el) : null;
      if (typeof forwarded === 'function') forwarded(el);
      else if (forwarded) forwarded.current = el;
    },
    [register, forwarded],
  );

  return (
    <div
      ref={ref}
      className={`glass ${className}`}
      style={{ borderRadius: radius, ...style }}
      data-config={JSON.stringify({ cornerRadius: radius, zRadius: Math.min(radius / 2, 12) })}
      {...rest}
    >
      {children}
    </div>
  );
});
