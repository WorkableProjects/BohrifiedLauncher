import { memo, useEffect, useRef, useState } from 'react';
import type { Deck, Slide } from '../model/types';
import { onRedraw } from '../state/session';
import { enqueue, renderThumb } from './thumbs';

/** A lazily-painted slide thumbnail. */
export const Thumb = memo(function Thumb({ deck, slide, width, className = '' }: { deck: Deck; slide: Slide; width: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const aspect = deck.size.h / deck.size.w;

  useEffect(() => {
    const io = new IntersectionObserver((e) => setVisible(e.some((x) => x.isIntersecting)), { rootMargin: '200px' });
    if (box.current) io.observe(box.current);
    return () => io.disconnect();
  }, []);

  // Re-check after media finishes decoding.
  useEffect(() => { const off = onRedraw(() => setEpoch((n) => n + 1)); return () => { off(); }; }, []);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    enqueue(() => {
      if (!live || !ref.current) return;
      const e = renderThumb(deck, slide, width);
      const c = ref.current;
      c.width = e.canvas.width;
      c.height = e.canvas.height;
      c.getContext('2d')!.drawImage(e.canvas as CanvasImageSource, 0, 0);
    });
    return () => {
      live = false;
    };
  }, [visible, deck.theme, deck.master, deck.layouts, deck.size, slide, width, epoch, deck]);

  return (
    <div ref={box} className={`thumb ${className}`} style={{ aspectRatio: `${deck.size.w} / ${deck.size.h}`, paddingBottom: 0 }} data-aspect={aspect}>
      {visible && <canvas ref={ref} />}
    </div>
  );
});
