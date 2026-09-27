/**
 * The Flow app icon. The artwork carries its own rounded-square shape, so
 * it is never clipped or re-cornered, and always drawn square.
 */
export function Logo({ size, className = '' }: { size: number; className?: string }) {
  return (
    <img
      src={size > 64 ? '/logo-512.png' : '/logo-192.png'}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className={`shrink-0 select-none ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
