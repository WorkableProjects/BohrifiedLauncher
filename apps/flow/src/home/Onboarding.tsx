import { useState } from 'react';
import { useUI } from '../state/ui';
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
 * First-launch welcome: asks for a first name (for the Home greeting),
 * then how Flow will be used so the canvas and controls are tuned for
 * touch or for pointer + keyboard. Both can be changed later.
 */
export function Onboarding() {
  const device = useUI((s) => s.device);
  const savedName = useUI((s) => s.name);
  const [step, setStep] = useState<'name' | 'device'>(savedName === null ? 'name' : 'device');
  const [name, setName] = useState(savedName ?? '');
  const [choice, setChoice] = useState<DevicePref>(device ?? guess());

  const submitName = (value: string) => {
    const clean = value.trim().replace(/\s+/g, ' ').slice(0, 40);
    // Returning users who already picked a device only need the name.
    if (device) ui.set({ name: clean });
    else {
      setName(clean);
      setStep('device');
    }
  };

  return (
    <div className="fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-3 backdrop-blur-[6px] sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="sheet pop-in w-full max-w-[640px] rounded-[30px]! p-6 sm:p-8" style={{ ['--origin' as string]: '50% 60%' }}>
        <div className="flex flex-col items-center text-center">
          <Logo size={72} className="drop-shadow-[0_8px_24px_var(--tint-glow)]" />
          <h1 id="welcome-title" className="mt-5 text-title-1 font-bold tracking-title">Welcome to Flow</h1>
          <p className="mt-2 max-w-md text-body text-label-2">
            {step === 'name' ? 'A fluid whiteboard for tutoring. What should we call you?' : `${name ? `Nice to meet you, ${name}. ` : ''}How will you use Flow?`}
          </p>
        </div>

        {step === 'name' ? (
          <form
            key="name"
            className="fade-in mx-auto mt-6 max-w-sm"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) submitName(name);
            }}
          >
            <label className="block">
              <span className="sr-only">First name</span>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="First name"
                aria-label="First name"
                autoComplete="given-name"
                autoCapitalize="words"
                maxLength={40}
                className="h-[50px] w-full rounded-[14px] bg-fill px-4 text-center text-headline font-semibold text-label outline-none placeholder:font-normal placeholder:text-label-3 focus:shadow-[0_0_0_2px_var(--tint)]"
              />
            </label>
            <button
              type="submit"
              disabled={!name.trim()}
              className="spring mt-4 flex h-[50px] w-full items-center justify-center rounded-full bg-tint text-headline font-semibold text-on-tint shadow-[0_4px_14px_var(--tint-glow)] hover:brightness-110 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none"
            >
              Continue
            </button>
            <button type="button" onClick={() => submitName('')} className="spring mt-2 flex h-11 w-full items-center justify-center rounded-full text-subhead font-semibold text-tint hover:bg-fill">
              Skip
            </button>
          </form>
        ) : (
          <div key="device" className="fade-in">
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
                    <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${on ? 'bg-tint text-on-tint' : 'bg-fill text-label'}`}>
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
              onClick={() => ui.set({ device: choice, name })}
              className="spring mt-6 flex h-[50px] w-full items-center justify-center rounded-full bg-tint text-headline font-semibold text-on-tint shadow-[0_4px_14px_var(--tint-glow)] hover:brightness-110 active:scale-[0.98]"
            >
              Continue
            </button>
          </div>
        )}
        <p className="mt-3 text-center text-footnote text-label-2">You can change this anytime in Settings.</p>
      </div>
    </div>
  );
}
