/** Short random ids: 10 base-36 chars (≈ 52 bits). Collisions within one deck are not a practical concern. */
export function uid(prefix = ''): string {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = (Math.random() * 256) | 0;
  let s = '';
  for (const b of bytes) s += b.toString(36).padStart(2, '0');
  return prefix + s.slice(0, 10);
}
