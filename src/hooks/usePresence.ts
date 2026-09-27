import { useEffect, useState } from 'react';

/**
 * Keeps a closing surface mounted long enough to play its exit animation,
 * so sheets and menus leave the way they arrived instead of vanishing.
 */
export function usePresence(open: boolean, exitMs = 180): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const t = window.setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(t);
  }, [open, exitMs]);
  return { mounted: open || mounted, leaving: !open && mounted };
}
