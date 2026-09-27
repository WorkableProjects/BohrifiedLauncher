import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { LiquidGlass } from '../vendor/liquidglass/index.js';

/**
 * Hosts one LiquidGlass (WebGL) instance for the stage. Toolbars register
 * themselves; the renderer refracts the board canvas beneath them.
 *
 * Constraints from the library: glass elements must be direct children of
 * the root, and canvas pixels changed via 2D context must be flagged with
 * markChanged(). If WebGL is unavailable or the user prefers reduced
 * transparency, bars keep their CSS backdrop-filter glass.
 */

interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface GlassContextValue {
  register: (el: HTMLElement) => () => void;
  /** Flag that pixels beneath glass changed (coalesced to one call per frame). */
  markChanged: (el?: HTMLElement) => void;
  /**
   * Flag a screen-space region as changed. Only bars overlapping it
   * re-render — ink far from any toolbar costs the GPU nothing.
   */
  markRegion: (r: Region | null) => void;
  active: boolean;
}

/** Glass samples a little beyond its box (refraction, shadow halo). */
const SAMPLE_PAD = 40;

const GlassContext = createContext<GlassContextValue>({ register: () => () => {}, markChanged: () => {}, markRegion: () => {}, active: false });

export const useGlass = () => useContext(GlassContext);

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

export function GlassProvider({ root, enabled, children }: { root: RefObject<HTMLElement | null>; enabled: boolean; children: ReactNode }) {
  const elements = useRef(new Set<HTMLElement>());
  const instance = useRef<LiquidGlass | null>(null);
  const [version, setVersion] = useState(0);
  const [active, setActive] = useState(false);
  const pending = useRef<Set<HTMLElement | undefined>>(new Set());
  const raf = useRef(0);

  const reduceTransparency = useMemo(() => window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches ?? false, []);
  const supported = useMemo(() => webglAvailable(), []);
  const on = enabled && supported && !reduceTransparency;

  const register = useCallback((el: HTMLElement) => {
    elements.current.add(el);
    setVersion((v) => v + 1);
    return () => {
      elements.current.delete(el);
      el.removeAttribute('data-glass-ready');
      setVersion((v) => v + 1);
    };
  }, []);

  // (Re)initialise when the set of glass elements or the preference changes.
  useEffect(() => {
    const rootEl = root.current;
    if (!rootEl || !on || elements.current.size === 0) {
      setActive(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const els = [...elements.current].filter((el) => el.parentElement === rootEl);
      try {
        const inst = await LiquidGlass.init({
          root: rootEl,
          glassElements: els,
          defaults: {
            blurAmount: 0.18,
            refraction: 0.55,
            chromAberration: 0.03,
            edgeHighlight: 0.08,
            specular: 0.25,
            fresnel: 0.7,
            zRadius: 18,
            saturation: 0.3,
            brightness: 0.02,
            shadowOpacity: 0.16,
            shadowSpread: 14,
            shadowOffsetY: 4,
          },
        });
        if (cancelled) {
          inst.destroy();
          return;
        }
        instance.current = inst;
        els.forEach((el) => el.setAttribute('data-glass-ready', ''));
        setActive(true);
      } catch (err) {
        console.warn('Flow: Liquid Glass unavailable, using CSS glass', err);
        setActive(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      instance.current?.destroy();
      instance.current = null;
      elements.current.forEach((el) => el.removeAttribute('data-glass-ready'));
      setActive(false);
    };
  }, [root, on, version]);

  const markChanged = useCallback((el?: HTMLElement) => {
    if (!instance.current) return;
    pending.current.add(el);
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const inst = instance.current;
      if (!inst) return;
      if (pending.current.has(undefined)) inst.markChanged();
      else pending.current.forEach((e) => e && inst.markChanged(e));
      pending.current.clear();
    });
  }, []);

  const markRegion = useCallback((r: Region | null) => {
    if (!instance.current) return;
    if (!r) return markChanged();
    for (const el of elements.current) {
      const b = el.getBoundingClientRect();
      if (r.x <= b.right + SAMPLE_PAD && r.x + r.w >= b.left - SAMPLE_PAD && r.y <= b.bottom + SAMPLE_PAD && r.y + r.h >= b.top - SAMPLE_PAD) {
        markChanged(el);
      }
    }
  }, [markChanged]);

  useEffect(() => {
    root.current?.setAttribute('data-liquid', active ? 'on' : 'off');
  }, [active, root]);

  const value = useMemo(() => ({ register, markChanged, markRegion, active }), [register, markChanged, markRegion, active]);
  return <GlassContext.Provider value={value}>{children}</GlassContext.Provider>;
}
