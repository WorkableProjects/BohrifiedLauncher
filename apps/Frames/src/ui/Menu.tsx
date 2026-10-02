import { useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Popover } from './Popover';

export interface MenuItem {
  label?: string;
  icon?: string;
  kbd?: string;
  onClick?: () => void;
  disabled?: boolean;
  divider?: boolean;
  danger?: boolean;
  checked?: boolean;
  heading?: string;
}

export function MenuList({ items, onDone }: { items: MenuItem[]; onDone: () => void }) {
  return (
    <div className="menu" role="menu">
      {items.map((it, i) =>
        it.divider ? <hr key={i} /> : it.heading ? <div key={i} className="menu-h">{it.heading}</div> : (
          <button key={i} type="button" role="menuitem" disabled={it.disabled} className={it.danger ? 'danger' : ''} onClick={() => { onDone(); it.onClick?.(); }}>
            <span className="mi">{it.icon ? <Icon name={it.icon} size={16} /> : it.checked ? <Icon name="check" size={16} /> : null}</span>
            <span className="ml">{it.label}</span>
            {it.kbd && <kbd>{it.kbd}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}

/** A button that opens a menu. */
export function MenuButton({ trigger, items, side = 'bottom', align = 'start', children }: { trigger: (p: { ref: React.RefObject<HTMLButtonElement | null>; open: boolean; toggle: () => void }) => ReactNode; items?: MenuItem[]; side?: 'bottom' | 'top' | 'right' | 'left'; align?: 'start' | 'end' | 'center'; children?: (close: () => void) => ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      {trigger({ ref, open, toggle: () => setOpen(!open) })}
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} side={side} align={align} className="menu-pop">
        {children ? children(() => setOpen(false)) : <MenuList items={items ?? []} onDone={() => setOpen(false)} />}
      </Popover>
    </>
  );
}

/** A floating context menu at a screen position. */
export function ContextMenu({ at, items, onClose }: { at: { x: number; y: number } | null; items: MenuItem[]; onClose: () => void }) {
  const anchor = useRef<HTMLSpanElement>(null);
  if (!at) return null;
  return (
    <>
      <span ref={anchor} style={{ position: 'fixed', left: at.x, top: at.y, width: 1, height: 1 }} />
      <Popover anchor={anchor} open onClose={onClose} side="bottom" className="menu-pop">
        <MenuList items={items} onDone={onClose} />
      </Popover>
    </>
  );
}
