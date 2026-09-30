import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { PINNED_APPEARANCE } from '../hooks/useAppearance';
import { COLORWAYS, ui, useUI, type Colorway } from '../state/ui';
import { BubbleGroup, useInBubble } from './Bubble';

interface ToolButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: IconName;
  label: string;
  active?: boolean;
  /** Keyboard shortcut shown in the tooltip. */
  shortcut?: string;
  iconSize?: number;
  children?: ReactNode;
}

/** 44×44 minimum target, SF Symbol glyph, tinted when active. */
export const ToolButton = forwardRef<HTMLButtonElement, ToolButtonProps>(function ToolButton(
  { icon, label, active, shortcut, iconSize = 21, className = '', children, ...rest },
  ref,
) {
  // Inside a BubbleGroup the moving bubble paints the selected fill.
  const bubbled = useInBubble();
  const activeClass = bubbled ? 'text-on-tint' : 'bg-tint text-on-tint shadow-[0_2px_8px_var(--tint-glow)]';
  // A changed glyph (shape kind, next ⇄ new page…) morphs in rather than snapping.
  const lastIcon = useRef(icon);
  const swapped = lastIcon.current !== icon;
  useEffect(() => {
    lastIcon.current = icon;
  }, [icon]);
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={`spring relative flex h-11 min-w-11 shrink-0 items-center justify-center rounded-full px-2.5 outline-none active:scale-[0.92] disabled:opacity-35 disabled:active:scale-100 ${
        active ? activeClass : 'text-label hover:bg-fill'
      } ${className}`}
      {...rest}
    >
      {icon && <Icon key={icon} name={icon} size={iconSize} className={swapped ? 'icon-swap' : undefined} />}
      {children}
    </button>
  );
});

export function Divider({ vertical = true }: { vertical?: boolean }) {
  return vertical ? <div className="mx-1 h-6 w-px shrink-0 bg-hairline" /> : <div className="my-1 h-px w-full bg-hairline" />;
}

/** Segmented control — the Apple pattern for mutually exclusive options. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <BubbleGroup active={value} variant="raised" role="radiogroup" label={label} className="flex rounded-full bg-fill p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          data-bubble={o.value}
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`spring relative flex h-9 min-w-9 flex-1 items-center justify-center rounded-full px-3 text-footnote font-semibold ${
            value === o.value ? 'text-label' : 'text-label-2 hover:text-label'
          }`}
        >
          {o.label}
        </button>
      ))}
    </BubbleGroup>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`spring relative h-[31px] w-[51px] shrink-0 rounded-full ${checked ? 'bg-[#34C759]' : 'bg-fill-2'}`}
    >
      <span className={`spring absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)] ${checked ? 'translate-x-5' : ''}`} />
    </button>
  );
}

/** Colorway swatches: a brand palette on top of light/dark. */
const COLORWAY_SWATCH: Record<Colorway, string> = {
  default: 'linear-gradient(135deg, #ff6083 50%, #ffd3d6 50%)',
  noir: 'linear-gradient(135deg, #000 50%, #fff 50%)',
  noirw: 'linear-gradient(135deg, #fff 65%, #000 65%)',
  noirb: 'linear-gradient(135deg, #000 65%, #fff 65%)',
  ocean: 'linear-gradient(135deg, #0a84ff 50%, #d6e9ff 50%)',
};

export function ColorwayPicker() {
  const value = useUI((s) => s.colorway);
  const pinned = PINNED_APPEARANCE[value];
  return (
    <div>
      <div className="flex gap-2" role="radiogroup" aria-label="Colorway">
        {COLORWAYS.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={value === c.value}
            aria-label={c.label}
            title={c.label}
            onClick={() => ui.set({ colorway: c.value })}
            className={`spring flex min-h-11 flex-1 flex-col items-center gap-1 rounded-[12px] px-1 py-1.5 text-caption ${value === c.value ? 'bg-fill-2 text-label' : 'text-label-2 hover:bg-fill'}`}
          >
            <span className="h-6 w-6 rounded-full shadow-[inset_0_0_0_1px_var(--hairline)] transition-transform duration-300 ease-apple" style={{ background: COLORWAY_SWATCH[c.value], transform: value === c.value ? 'scale(1.12)' : undefined }} />
            {c.label}
          </button>
        ))}
      </div>
      {pinned && <p className="mt-1.5 text-footnote text-label-2">{pinned === 'light' ? 'NoirW' : 'NoirB'} keeps Flow {pinned}.</p>}
    </div>
  );
}
