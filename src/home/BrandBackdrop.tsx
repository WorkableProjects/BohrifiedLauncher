import { useMemo } from 'react';
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
const MASK = { WebkitMaskImage: 'url(/logo-512.png)', maskImage: 'url(/logo-512.png)', WebkitMaskSize: '100% 100%', maskSize: '100% 100%' };

/**
 * Home's brand mark: the Flow logo at full strength, bleeding off the left
 * edge. Home's background matches the icon tile, so only the lettering
 * reads, as if written on the page. A soft glitter twinkles inside the
 * logo's shape (the sparkle layer is masked by the logo's own alpha).
 */
export function BrandBackdrop({ className = '' }: { className?: string }) {
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
    <div aria-hidden className={`pointer-events-none relative aspect-square shrink-0 select-none ${className}`}>
      <Logo size="100%" className="absolute inset-0" />
      <div className="absolute inset-0 overflow-hidden" style={MASK}>
        <div className="glitter-sheen absolute inset-0" />
        {sparkles.map((p, i) => (
          <span
            key={i}
            className="glitter-dot absolute"
            style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }}
          />
        ))}
      </div>
    </div>
  );
}
