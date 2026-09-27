import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';

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
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={`spring relative flex h-11 min-w-11 items-center justify-center rounded-full px-2.5 outline-none active:scale-[0.92] disabled:opacity-35 disabled:active:scale-100 ${
        active ? 'bg-tint text-white shadow-[0_2px_8px_rgba(0,122,255,0.35)]' : 'text-label hover:bg-fill'
      } ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={iconSize} />}
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
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-fill p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`spring flex h-9 min-w-9 flex-1 items-center justify-center rounded-full px-3 text-footnote font-semibold ${
            value === o.value ? 'bg-bg text-label shadow-[0_1px_4px_rgba(0,0,0,0.12)] dark:bg-fill-2' : 'text-label-2 hover:text-label'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
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
