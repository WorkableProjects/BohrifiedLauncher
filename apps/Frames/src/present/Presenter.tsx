import { useCallback, useEffect, useRef, useState } from 'react';
import { Btn } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { Thumb } from '../editor/Thumb';
import { assets, doc } from '../state/session';
import { prefs } from '../state/prefs';
import { toast } from '../state/ui';
import type { PlayerState } from './player';
import { PlayerView, type PlayerHandle } from './PlayerView';

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
};

/** Fullscreen presentation with a floating control bar, notes, overview and a timer. */
export function Presenter({ from, onExit }: { from: number; onExit: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const view = useRef<PlayerHandle>(null);
  const deck = doc.deck;
  const p = prefs.get();
  const [state, setState] = useState<PlayerState>({ index: 0, count: deck.slides.filter((s) => !s.hidden).length, slideId: '', step: 0, steps: 0, blank: 'none', transitioning: false });
  const [hud, setHud] = useState(true);
  const [notes, setNotes] = useState(p.presentNotes);
  const [overview, setOverview] = useState(false);
  const [jump, setJump] = useState('');
  const [elapsed, setElapsed] = useState(0);
  
  const hideTimer = useRef(0);
  const t0 = useRef(performance.now());

  const wake = useCallback(() => {
    setHud(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setHud(false), 2600);
  }, []);

  const shown = deck.slides.filter((s) => !s.hidden);
  const slide = shown[state.index];

  useEffect(() => {
    wake();
    const tick = window.setInterval(() => setElapsed(performance.now() - t0.current), 500);
    // Try real fullscreen; if the host disallows it, the overlay still fills the window.
    void root.current?.requestFullscreen?.().catch(() => {});
    return () => {
      clearInterval(tick);
      clearTimeout(hideTimer.current);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [wake]);

  // Leaving real fullscreen with Esc also ends the show.
  useEffect(() => {
    const on = () => { if (!document.fullscreenElement && t0.current && performance.now() - t0.current > 600 && fsEntered.current) onExit(); };
    const entered = () => { if (document.fullscreenElement) fsEntered.current = true; };
    document.addEventListener('fullscreenchange', entered);
    document.addEventListener('fullscreenchange', on);
    return () => { document.removeEventListener('fullscreenchange', entered); document.removeEventListener('fullscreenchange', on); };
  }, [onExit]);
  const fsEntered = useRef(false);

  useEffect(() => {
    const go = (i: number) => { view.current?.goto(Math.max(0, Math.min(shown.length - 1, i))); setOverview(false); };
    const key = (e: KeyboardEvent) => {
      wake();
      if (e.metaKey || e.ctrlKey) return;
      const k = e.key;
      if (/^[0-9]$/.test(k)) { setJump((j) => (j + k).slice(0, 4)); return e.preventDefault(); }
      if (k === 'Enter' && jump) { go(parseInt(jump, 10) - 1); setJump(''); return e.preventDefault(); }
      if (k === 'Escape') { e.preventDefault(); if (jump) return setJump(''); if (overview) return setOverview(false); return onExit(); }
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n'].includes(k) && k !== 'n') { e.preventDefault(); view.current?.next(); }
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); view.current?.prev(); }
      else if (k === 'Home') go(0);
      else if (k === 'End') go(shown.length - 1);
      else if (k === 'b' || k === 'B' || k === '.') view.current?.blank('black');
      else if (k === 'w' || k === 'W' || k === ',') view.current?.blank('white');
      else if (k === 'n' || k === 'N') setNotes((v) => !v);
      else if (k === 'g' || k === 'G') setOverview((v) => !v);
      else if (k === 'f' || k === 'F') toggleFs();
      else if (k === 'p' || k === 'P') openPresenterView();
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump, overview, shown.length, wake, onExit]);

  const toggleFs = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen?.().catch(() => toast('Fullscreen is not available here.'));
  };

  const openPresenterView = () => {
    const w = window.open(`${location.pathname}?view=presenter&deck=${encodeURIComponent(deck.id)}&at=${state.index}`, 'frames-presenter', 'popup,width=1180,height=760');
    if (!w) toast('Allow pop-ups to open the presenter view.');
    
  };

  // Swipes for touch remotes.
  const touch = useRef(0);
  const progress = shown.length > 1 ? (state.index + (state.steps ? state.step / (state.steps + 1) : 0)) / (shown.length - 1) : 1;

  return (
    <div
      ref={root}
      className={`present ${!hud && p.presentHideCursor ? 'hide-cursor' : ''}`}
      role="dialog"
      aria-label="Presentation"
      data-testid="presenter"
      onTouchStart={(e) => (touch.current = e.touches[0]!.clientX)}
      onTouchEnd={(e) => { const dx = e.changedTouches[0]!.clientX - touch.current; if (Math.abs(dx) > 60) { dx < 0 ? view.current?.next() : view.current?.prev(); e.preventDefault(); } }}
    >
      <PlayerView ref={view} deck={deck} assets={assets} from={from} simple={p.presentTransitions === 'simple'} sync onState={setState} onEnd={onExit} onActivity={wake} />
      {p.presentProgress && <div className="progress" aria-hidden><i style={{ width: `${progress * 100}%` }} /></div>}
      {jump && <div className="jump" role="status">Go to slide {jump}</div>}
      {notes && slide?.notes.trim() && <div className="notes-card" aria-label="Speaker notes">{slide.notes}</div>}
      {overview && (
        <div className="overview" role="listbox" aria-label="Slides">
          {shown.map((s, i) => (
            <button key={s.id} type="button" role="option" aria-selected={i === state.index} className={i === state.index ? 'cur' : ''} onClick={() => { view.current?.goto(i); setOverview(false); }}>
              <Thumb deck={deck} slide={s} width={240} />
              <span style={{ fontSize: 12, opacity: 0.7 }}>{i + 1}</span>
            </button>
          ))}
        </div>
      )}
      <div className={`hud ${hud ? '' : 'gone'}`} role="toolbar" aria-label="Presentation controls">
        <Btn icon="chevron-left" title="Previous (←)" onClick={() => view.current?.prev()} />
        <span className="count" aria-live="polite">{state.index + 1} / {state.count}</span>
        <Btn icon="chevron-right" title="Next (→)" onClick={() => view.current?.next()} />
        <span className="sep" />
        {p.presentTimer && <button type="button" className="timer" title="Click to reset" onClick={() => { t0.current = performance.now(); setElapsed(0); }}>{clock(elapsed)}</button>}
        <Btn icon="blank" title="Black screen (B)" active={state.blank === 'black'} onClick={() => view.current?.blank('black')} />
        <Btn icon="notes" title="Speaker notes (N)" active={notes} onClick={() => setNotes(!notes)} />
        <Btn icon="slides" title="All slides (G)" active={overview} onClick={() => setOverview(!overview)} />
        <Btn icon="monitor" title="Presenter view in a new window (P)" onClick={openPresenterView} />
        <Btn icon="fullscreen" title="Fullscreen (F)" onClick={toggleFs} />
        <span className="sep" />
        <Btn icon="x" title="End presentation (Esc)" onClick={onExit} />
      </div>
      <Icon name="x" size={0} />
    </div>
  );
}
