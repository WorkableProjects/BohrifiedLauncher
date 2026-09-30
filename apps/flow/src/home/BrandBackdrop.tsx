import { useMemo } from 'react';
import { useUI } from '../state/ui';
import { Logo } from '../ui/Logo';

/** Deterministic pseudo-random numbers, so sparkles don't jump between renders. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const SPARKLES = 46;
const LOGO_MASK = `url(${import.meta.env.BASE_URL}logo-512.png)`;
const MASK = { WebkitMaskImage: LOGO_MASK, maskImage: LOGO_MASK, WebkitMaskSize: '100% 100%', maskSize: '100% 100%' };

/**
 * Home's background: the Flow logo, full window height, fixed behind the
 * page and running off the left edge. Home's page color matches the icon
 * tile, so mostly the lettering reads. A barely-there glitter twinkles
 * inside the logo's shape (the sparkle layer is masked by its alpha).
 */
export function BrandBackdrop() {
  // Mobile skips the animated glitter (46 infinite animations) for performance.
  const mobile = useUI((s) => s.device === 'mobile');
  const sparkles = useMemo(() => {
    const rnd = seeded(7);
    return Array.from({ length: SPARKLES }, () => ({
      x: 6 + rnd() * 88,
      y: 6 + rnd() * 88,
      size: 4 + rnd() * 8,
      delay: -rnd() * 4.8,
      duration: 2.6 + rnd() * 2.4,
    }));
  }, []);

  return (
    <div aria-hidden className="brand-backdrop pointer-events-none fixed top-0 left-[-9vh] aspect-square h-dvh select-none">
      <Logo size="100%" className="absolute inset-0" />
      {!mobile && (
        <div className="glitter absolute inset-0 overflow-hidden" style={MASK}>
          <div className="glitter-sheen absolute inset-0" />
          {sparkles.map((p, i) => (
            <span
              key={i}
              className="glitter-dot absolute"
              style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
