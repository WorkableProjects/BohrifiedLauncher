import { useState } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { ui, type DevicePref } from '../state/ui';
import { Logo } from '../ui/Logo';

const OPTIONS: { value: DevicePref; icon: IconName; title: string; subtitle: string; points: [IconName, string][] }[] = [
  {
    value: 'mobile',
    icon: 'tablet',
    title: 'Tablet or Phone',
    subtitle: 'iPad, iPhone, Android',
    points: [
      ['handDraw', 'Draw with your finger or Apple Pencil'],
      ['zoomIn', 'Pinch to zoom, two fingers to pan'],
      ['check', 'Every control visible, no hover'],
    ],
  },
  {
    value: 'desktop',
    icon: 'desktop',
    title: 'Desktop or Laptop',
    subtitle: 'Mac, Windows, Chromebook',
    points: [
      ['select', 'Mouse, trackpad or pen tablet'],
      ['keyboard', 'Keyboard shortcuts for every tool'],
      ['fit', 'Zoom controls and a student view window'],
    ],
  },
];

/** A best guess to pre-select: coarse primary pointer ⇒ touch device. */
const guess = (): DevicePref => (window.matchMedia?.('(pointer: coarse)').matches ? 'mobile' : 'desktop');

/**
 * First-launch welcome. Asks how Flow will be used so the canvas and
 * controls are tuned for touch or for pointer + keyboard. Changeable
 * later in Settings.
 */
export function Onboarding() {
  const [choice, setChoice] = useState<DevicePref>(guess);
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-3 backdrop-blur-[6px] sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="sheet pop-in w-full max-w-[640px] rounded-[30px]! p-6 sm:p-8" style={{ ['--origin' as string]: '50% 60%' }}>
        <div className="flex flex-col items-center text-center">
          <Logo size={72} className="drop-shadow-[0_8px_24px_var(--tint-glow)]" />
          <h1 id="welcome-title" className="mt-5 text-title-1 font-bold tracking-title">Welcome to Flow</h1>
          <p className="mt-2 max-w-md text-body text-label-2">A fluid whiteboard for tutoring. How will you use it?</p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Device">
          {OPTIONS.map((o) => {
            const on = choice === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setChoice(o.value)}
                className={`spring relative rounded-[22px] bg-bg p-4 text-left sm:p-5 ${on ? 'shadow-[0_0_0_2.5px_var(--tint),0_8px_24px_var(--tint-glow)]' : 'shadow-[0_0_0_1px_var(--hairline)] hover:shadow-[0_0_0_1px_var(--separator)]'}`}
              >
                <span className={`spring absolute top-4 right-4 ${on ? 'text-tint' : 'text-label-3'}`}>
                  {on ? <Icon name="checkFill" size={22} /> : <span className="block h-[22px] w-[22px] rounded-full shadow-[inset_0_0_0_1.5px_var(--label-3)]" />}
                </span>
                <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${on ? 'bg-tint text-white' : 'bg-fill text-label'}`}>
                  <Icon name={o.icon} size={26} />
                </span>
                <p className="mt-3 text-headline font-semibold">{o.title}</p>
                <p className="text-footnote text-label-2">{o.subtitle}</p>
                <ul className="mt-3 space-y-1.5 max-sm:hidden">
                  {o.points.map(([icon, text]) => (
                    <li key={text} className="flex items-center gap-2 text-footnote text-label">
                      <Icon name={icon} size={13} className="text-tint" />
                      {text}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => ui.set({ device: choice })}
          className="spring mt-6 flex h-[50px] w-full items-center justify-center rounded-full bg-tint text-headline font-semibold text-white shadow-[0_4px_14px_var(--tint-glow)] hover:brightness-110 active:scale-[0.98]"
        >
          Continue
        </button>
        <p className="mt-3 text-center text-footnote text-label-2">You can change this anytime in Settings.</p>
      </div>
    </div>
  );
}
