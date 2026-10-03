import { Player } from '../present/player';
import { AssetStore } from '../render/assets';
import type { AssetMeta, Deck } from '../model/types';

/**
 * The standalone player inlined into "Animated presentation" exports: the
 * same Player (renderer, animation engine, transitions) as the editor, with
 * media read from data URLs embedded in the page.
 */

interface Payload { deck: Deck; assets: Record<string, string> }

const raw = document.getElementById('frames-data')?.textContent;
if (raw) {
  const { deck, assets: urls } = JSON.parse(raw) as Payload;
  const meta = deck.assets as Record<string, AssetMeta>;
  const store = new AssetStore(async (id) => (urls[id] ? (await fetch(urls[id]!)).blob() : undefined), () => meta);
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const bar = document.getElementById('bar') as HTMLElement;
  const hint = document.getElementById('hint') as HTMLElement;
  const player = new Player({
    canvas,
    deck,
    assets: store,
    onChange: (s) => {
      bar.style.width = `${((s.index + (s.steps ? s.step / (s.steps + 1) : 0)) / Math.max(1, s.count - 1)) * 100}%`;
    },
    onLink: (u) => window.open(u, '_blank', 'noopener'),
  });
  const fit = () => player.resize(innerWidth, innerHeight);
  addEventListener('resize', fit);
  fit();
  player.start(0);
  setTimeout(() => (hint.style.opacity = '0'), 4000);

  addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ': case 'Enter': e.preventDefault(); player.next(); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'Backspace': e.preventDefault(); player.prev(); break;
      case 'Home': void player.goto(0, false, true); break;
      case 'End': void player.goto(player.state.count - 1, false, true); break;
      case 'b': case 'B': case '.': player.setBlank('black'); break;
      case 'w': case 'W': player.setBlank('white'); break;
      case 'f': case 'F':
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.();
        break;
      default:
    }
  });
  canvas.addEventListener('click', (e) => player.click(e.clientX, e.clientY));
  let x0 = 0;
  canvas.addEventListener('touchstart', (e) => (x0 = e.touches[0]!.clientX), { passive: true });
  canvas.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0]!.clientX - x0;
    if (Math.abs(dx) > 50) dx < 0 ? player.next() : player.prev();
    e.preventDefault();
  });
}
