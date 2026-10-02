import { useEffect, useMemo, useRef, useState } from 'react';
import { loadDeck, getAssetBlob } from '../io/library';
import { sanitizeDeck } from '../io/project';
import { renderSlide } from '../io/exporters';
import type { Deck } from '../model/types';
import { AssetStore } from '../render/assets';
import { canvasToBlob } from '../render/canvas';
import { Btn } from '../ui/controls';
import { openChannel } from './channel';
import type { PlayerState } from './player';
import { PlayerView, type PlayerHandle } from './PlayerView';

function useDeck(): { deck: Deck | null; assets: AssetStore | null; error: string | null; at: number } {
  const q = new URLSearchParams(location.search);
  const id = q.get('deck') ?? '';
  const at = Number(q.get('at') ?? 0) || 0;
  const [deck, setDeck] = useState<Deck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const assets = useMemo(() => (deck ? new AssetStore(getAssetBlob, () => deck.assets) : null), [deck]);
  useEffect(() => {
    void loadDeck(id).then((d) => (d ? setDeck(sanitizeDeck(structuredClone(d))) : setError('That presentation could not be found. Open it in Frames first.'))).catch(() => setError('Could not open the presentation.'));
  }, [id]);
  return { deck, assets, error, at };
}

/** A fullscreen audience display for a second screen, driven from the presenter view. */
export function AudienceApp() {
  const { deck, assets, error, at } = useDeck();
  if (error) return <div className="loading">{error}</div>;
  if (!deck || !assets) return <div className="loading"><div className="spinner" /></div>;
  return (
    <div className="present" data-testid="audience">
      <PlayerView deck={deck} assets={assets} from={at} sync />
    </div>
  );
}

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Current slide, next slide, notes and a timer; controls the audience window. */
export function PresenterApp() {
  const { deck, assets, error, at } = useDeck();
  const view = useRef<PlayerHandle>(null);
  const next = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<PlayerState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [t0, setT0] = useState(() => performance.now());
  const shown = deck?.slides.filter((s) => !s.hidden) ?? [];

  useEffect(() => {
    const id = window.setInterval(() => setElapsed(performance.now() - t0), 500);
    return () => clearInterval(id);
  }, [t0]);

  // Draw the upcoming slide.
  useEffect(() => {
    if (!deck || !assets || !state) return;
    const n = shown[state.index + 1];
    const c = next.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    if (!n) {
      c.width = 640; c.height = 360;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 640, 360);
      ctx.fillStyle = '#888'; ctx.font = '24px system-ui'; ctx.textAlign = 'center'; ctx.fillText('End of presentation', 320, 190);
      return;
    }
    let live = true;
    void renderSlide(deck, n, 640, assets).then(async (r) => { if (!live) return; c.width = r.width; c.height = r.height; ctx.drawImage(r as CanvasImageSource, 0, 0); void canvasToBlob; });
    return () => { live = false; };
  }, [deck, assets, state?.index]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown' || e.key === 'ArrowDown') { e.preventDefault(); view.current?.next(); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'ArrowUp') { e.preventDefault(); view.current?.prev(); }
      if (e.key === 'b') view.current?.blank('black');
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  if (error) return <div className="loading">{error}</div>;
  if (!deck || !assets) return <div className="loading"><div className="spinner" /></div>;
  const slide = state ? shown[state.index] : undefined;
  void openChannel;
  return (
    <div className="presenter-view" data-testid="presenter-view">
      <div style={{ gridRow: '1 / 3' }}>
        <h4>Now · {state ? `${state.index + 1} / ${state.count}` : ''}</h4>
        <div style={{ aspectRatio: `${deck.size.w} / ${deck.size.h}`, position: 'relative' }}>
          <PlayerView ref={view} deck={deck} assets={assets} from={at} silent sync onState={setState} className="pv-canvas" />
        </div>
        <div className="row" style={{ marginTop: 14, gap: 10 }}>
          <Btn icon="chevron-left" label="Previous" variant="ghost" className="ghost" onClick={() => view.current?.prev()} />
          <Btn icon="chevron-right" label="Next" variant="tint" onClick={() => view.current?.next()} />
          <Btn icon="blank" label="Black" variant="ghost" className="ghost" onClick={() => view.current?.blank('black')} />
        </div>
      </div>
      <div>
        <h4>Next</h4>
        <canvas ref={next} />
        <h4 style={{ marginTop: 18 }}>Time</h4>
        <div className="clock" onClick={() => { setT0(performance.now()); setElapsed(0); }} title="Click to reset">{clock(elapsed)}</div>
      </div>
      <div style={{ gridColumn: '2', overflow: 'auto' }}>
        <h4>Notes</h4>
        <div className="notes-big">{slide?.notes.trim() || <span style={{ opacity: 0.4 }}>No notes for this slide.</span>}</div>
      </div>
    </div>
  );
}
