const BASE = import.meta.env.BASE_URL;

/**
 * The Flow app icon, in its light or dark artwork to match the appearance.
 * The artwork carries its own rounded-square shape, so it is never clipped
 * or re-cornered, and always drawn square.
 */
export function Logo({ size, className = '' }: { size: number | string; className?: string }) {
  const big = typeof size === 'string' || size > 64;
  const box = { width: size, height: size };
  const cls = `shrink-0 select-none ${className}`;
  return (
    <>
      <img src={`${BASE}${big ? 'logo-512.png' : 'logo-192.png'}`} alt="" draggable={false} className={`${cls} dark:hidden`} style={box} />
      <img src={`${BASE}${big ? 'logo-dark-512.png' : 'logo-dark-192.png'}`} alt="" draggable={false} className={`${cls} hidden dark:block`} style={box} />
    </>
  );
}
