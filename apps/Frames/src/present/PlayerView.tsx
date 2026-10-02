import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { Deck } from '../model/types';
import type { AssetStore } from '../render/assets';
import { Player, type PlayerState } from './player';
import { openChannel, type Channel } from './channel';

export interface PlayerHandle {
  next(): void;
  prev(): void;
  goto(i: number): void;
  blank(b: 'black' | 'white'): void;
  player(): Player | null;
}

interface Props {
  deck: Deck;
  assets: AssetStore;
  from?: number;
  simple?: boolean;
  silent?: boolean;
  /** Sync with other windows showing the same deck. */
  sync?: boolean;
  onState?: (s: PlayerState) => void;
  onEnd?: () => void;
  onActivity?: () => void;
  className?: string;
}

/**
 * The slide-show canvas. It owns a `Player`, resizes with its box, and — when
 * `sync` is on — mirrors every command to other windows over a channel.
 */
export const PlayerView = forwardRef<PlayerHandle, Props>(function PlayerView({ deck, assets, from = 0, simple, silent, sync, onState, onEnd, onActivity, className }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const player = useRef<Player | null>(null);
  const chan = useRef<Channel | null>(null);
  const cb = useRef({ onState, onEnd });
  cb.current = { onState, onEnd };

  useEffect(() => {
    const c = canvas.current!;
    const ch = sync ? openChannel(deck.id) : null;
    chan.current = ch;
    const p = new Player({
      canvas: c, deck, assets, simpleTransitions: simple, silent,
      onChange: (s) => cb.current.onState?.(s),
      onEnd: () => cb.current.onEnd?.(),
      onLink: (u) => window.open(u, '_blank', 'noopener'),
    });
    player.current = p;
    const fit = () => {
      const r = c.getBoundingClientRect();
      p.resize(r.width, r.height);
    };
    let fr = 0;
    // Resize on the next frame: changing the canvas inside the observer callback trips "ResizeObserver loop" errors.
    const ro = new ResizeObserver(() => { cancelAnimationFrame(fr); fr = requestAnimationFrame(fit); });
    ro.observe(c);
    fit();
    p.start(from);
    const off = ch?.on((m) => {
      if (m.t === 'next') p.next();
      else if (m.t === 'prev') p.prev();
      else if (m.t === 'goto') void p.goto(m.i, false, true);
      else if (m.t === 'blank') p.setBlank(m.b);
      else if (m.t === 'hello') ch.send({ t: 'sync', i: p.state.index, step: p.state.step });
      else if (m.t === 'sync') void p.goto(m.i, false, true).then(() => { for (let k = 0; k < m.step; k++) p.next(); });
      else if (m.t === 'exit') cb.current.onEnd?.();
    });
    ch?.send({ t: 'hello' });
    return () => {
      off?.();
      ch?.close();
      ro.disconnect();
      cancelAnimationFrame(fr);
      p.dispose();
      player.current = null;
    };
    // The player is created once per mount; deck edits during a show are not live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    next: () => { player.current?.next(); chan.current?.send({ t: 'next' }); },
    prev: () => { player.current?.prev(); chan.current?.send({ t: 'prev' }); },
    goto: (i) => { void player.current?.goto(i, false, true); chan.current?.send({ t: 'goto', i }); },
    blank: (b) => { player.current?.setBlank(b); chan.current?.send({ t: 'blank', b }); },
    player: () => player.current,
  }), []);

  return (
    <canvas
      ref={canvas}
      className={className}
      data-testid="player-canvas"
      onPointerMove={onActivity}
      onClick={(e) => {
        onActivity?.();
        const r = e.currentTarget.getBoundingClientRect();
        // A tap on the far left edge goes back (remotes and touch screens).
        if ((e as unknown as PointerEvent).pointerType === 'touch' && e.clientX - r.left < r.width * 0.15) return void (player.current?.prev(), chan.current?.send({ t: 'prev' }));
        const p = player.current;
        if (!p) return;
        const before = p.state;
        p.click(e.clientX - r.left, e.clientY - r.top);
        const after = p.state;
        // Mirror the outcome of a click as a plain "next" for other windows.
        if (after.index !== before.index || after.step !== before.step || after.transitioning !== before.transitioning) chan.current?.send({ t: 'next' });
      }}
    />
  );
});
