import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons/Icon';
import { ui } from '../state/ui';
import { ToolButton } from './controls';
import { Glass } from './Glass';

const PRESETS = [1, 3, 5, 10, 15];

function fmt(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Soft two-note chime via WebAudio — no asset needed. */
function chime() {
  try {
    const ctx = new AudioContext();
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.type = 'sine';
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 1);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* audio unavailable */ }
}

/**
 * Session timer for timed practice: count up (stopwatch) or count down
 * from a preset. Floats top-centre as its own glass capsule.
 */
export function Timer() {
  const [mode, setMode] = useState<'up' | 'down'>('down');
  const [duration, setDuration] = useState(5 * 60_000);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const startedAt = useRef(0);
  const base = useRef(0);
  const fired = useRef(false);
  /** Bumped on reset so a stopping interval doesn't bank stale time. */
  const gen = useRef(0);

  useEffect(() => {
    if (!running) return;
    const myGen = gen.current;
    startedAt.current = performance.now();
    const id = setInterval(() => {
      const e = base.current + performance.now() - startedAt.current;
      setElapsed(e);
      if (mode === 'down' && e >= duration && !fired.current) {
        fired.current = true;
        setRunning(false);
        base.current = duration;
        chime();
      }
    }, 200);
    return () => {
      clearInterval(id);
      if (gen.current === myGen && !fired.current) base.current += performance.now() - startedAt.current;
    };
  }, [running, mode, duration]);

  const reset = () => {
    gen.current++;
    setRunning(false);
    base.current = 0;
    fired.current = false;
    setElapsed(0);
  };

  const remaining = duration - elapsed;
  const done = mode === 'down' && remaining <= 0;
  const progress = mode === 'down' ? Math.min(1, elapsed / duration) : 0;

  return (
    <Glass radius={26} className="pop-in absolute top-[calc(max(16px,env(safe-area-inset-top))+72px)] right-4 z-20" role="timer" aria-label="Session timer" style={{ ['--origin' as string]: '100% 0%' }}>
      <div className="flex items-center gap-1 p-1.5">
        <button
          type="button"
          onClick={() => { reset(); setMode(mode === 'up' ? 'down' : 'up'); }}
          title={mode === 'down' ? 'Countdown — switch to stopwatch' : 'Stopwatch — switch to countdown'}
          className="spring flex h-11 w-11 items-center justify-center rounded-full text-label-2 hover:bg-fill"
        >
          <Icon name={mode === 'down' ? 'timer' : 'reset'} size={19} className={mode === 'up' ? '-scale-x-100' : ''} />
        </button>
        <div className="relative flex h-11 min-w-[86px] items-center justify-center">
          {mode === 'down' && (
            <svg className="absolute inset-0 m-auto h-11 w-[86px]" viewBox="0 0 86 44" aria-hidden>
              <rect x="1.5" y="1.5" width="83" height="41" rx="20.5" fill="none" stroke="var(--fill-2)" strokeWidth="3" />
              <rect x="1.5" y="1.5" width="83" height="41" rx="20.5" fill="none" stroke={done ? 'var(--danger)' : 'var(--tint)'} strokeWidth="3" pathLength={100} strokeDasharray={`${(1 - progress) * 100} 100`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 200ms linear' }} />
            </svg>
          )}
          <span className={`relative text-title-2 font-semibold tracking-title tabular-nums ${done ? 'text-danger' : 'text-label'}`}>
            {mode === 'down' ? fmt(remaining) : fmt(elapsed)}
          </span>
        </div>
        {mode === 'down' && !running && elapsed === 0 && (
          <div className="flex">
            {PRESETS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDuration(m * 60_000)}
                className={`spring h-11 min-w-9 rounded-full px-2 text-footnote font-semibold ${duration === m * 60_000 ? 'text-tint' : 'text-label-2 hover:bg-fill'}`}
              >
                {m}m
              </button>
            ))}
          </div>
        )}
        <ToolButton icon={running ? 'pause' : 'play'} label={running ? 'Pause' : 'Start'} iconSize={16} active={!running && !done} onClick={() => (done ? reset() : setRunning(!running))} />
        <ToolButton icon="reset" label="Reset" iconSize={17} onClick={reset} />
        <ToolButton icon="close" label="Close timer" iconSize={12} onClick={() => ui.set({ timerOpen: false })} />
      </div>
    </Glass>
  );
}
