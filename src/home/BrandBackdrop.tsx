import { useMemo } from 'react';

/** Deterministic pseudo-random numbers, so sparkles don't jump between renders. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const SPARKLES = 46;

/**
 * Home's brand backdrop: the Flow logo, large and faded into the page,
 * with a soft glitter that twinkles only inside the lettering and tile
 * (the sparkle layer is masked by the logo's own alpha).
 */
export function BrandBackdrop() {
  const sparkles = useMemo(() => {
    const rnd = seeded(7);
    return Array.from({ length: SPARKLES }, () => ({
      x: 6 + rnd() * 88,
      y: 6 + rnd() * 88,
      size: 3 + rnd() * 7,
      delay: -rnd() * 4.8,
      duration: 2.6 + rnd() * 2.4,
    }));
  }, []);

  const mask = { WebkitMaskImage: 'url(/logo-512.png)', maskImage: 'url(/logo-512.png)', WebkitMaskSize: '100% 100%', maskSize: '100% 100%' };

  return (
    <div aria-hidden className="brand-backdrop pointer-events-none absolute top-[-4%] right-[-22%] w-[min(92vw,860px)] select-none sm:right-[-14%]">
      <div className="relative aspect-square w-full">
        <img src="/logo-512.png" alt="" draggable={false} className="absolute inset-0 h-full w-full" />
        {/* Glitter: a slow sheen plus scattered twinkles, clipped to the logo. */}
        <div className="absolute inset-0 overflow-hidden" style={mask}>
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
    </div>
  );
}
