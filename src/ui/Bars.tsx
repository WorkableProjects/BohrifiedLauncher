import { useEffect, useRef, useState } from 'react';
import { getController } from '../canvas/instance';
import { Icon, type IconName } from '../icons/Icon';
import type { Appearance } from '../engine/theme';
import type { Background } from '../engine/types';
import {
  copyPng,
  deleteSelection,
  duplicateSelection,
  exportPng,
  goToPage,
  newDocument,
  openDocument,
  openPresenter,
  redo,
  reorderSelection,
  saveDocument,
  undo,
} from '../state/actions';
import { board, useBoard } from '../state/board';
import { ui, useUI, type AppearancePref, type DevicePref } from '../state/ui';
import { channelSupported } from '../engine/sync';
import { Divider, Segmented, Toggle, ToolButton } from './controls';
import { Glass } from './Glass';
import { Popover } from './Popover';

// ─── Top-left: identity, title, pages ────────────────────────────────

export function TitleBar({ onHome }: { onHome: () => void }) {
  const title = useBoard((b) => b.doc.title);
  const pageIndex = useBoard((b) => b.doc.pages.findIndex((p) => p.id === b.doc.activePage));
  const pageCount = useBoard((b) => b.doc.pages.length);
  const [draft, setDraft] = useState(title);
  useEffect(() => setDraft(title), [title]);

  return (
    <Glass radius={26} className="absolute top-[max(16px,env(safe-area-inset-top))] left-4 z-20" role="toolbar" aria-label="Lesson">
      <div className="flex items-center gap-0.5 p-1.5">
        <button
          type="button"
          onClick={onHome}
          aria-label="All lessons"
          title="All lessons"
          className="spring flex h-11 items-center gap-0.5 rounded-full pr-1.5 pl-2 text-tint hover:bg-fill active:scale-[0.94]"
        >
          <Icon name="chevronLeft" size={14} />
          <img src="/favicon.svg" alt="" className="h-7 w-7 rounded-[8px]" />
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => board.setTitle(draft.trim() || 'Untitled Lesson')}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
          }}
          aria-label="Lesson title"
          size={Math.max(6, Math.min(28, draft.length + 1))}
          className="h-11 max-w-[28vw] truncate max-sm:hidden rounded-xl bg-transparent px-2 text-headline font-semibold tracking-title text-label outline-none focus:bg-fill"
        />
        <span className="max-sm:hidden"><Divider /></span>
        <ToolButton icon="pages" label="Pages" shortcut="⌥P" active={useUI((s) => s.pagesOpen)} onClick={() => ui.set({ pagesOpen: !ui.get().pagesOpen })} />
        <ToolButton icon="chevronLeft" label="Previous page" shortcut="PgUp" iconSize={15} disabled={pageIndex <= 0} onClick={() => goToPage(-1)} className="max-sm:hidden" />
        <span className="min-w-12 text-center text-subhead font-semibold text-label tabular-nums max-sm:hidden" aria-live="polite">
          {pageIndex + 1}
          <span className="text-label-2"> / {pageCount}</span>
        </span>
        <ToolButton
          icon={pageIndex >= pageCount - 1 ? 'plus' : 'chevronRight'}
          label={pageIndex >= pageCount - 1 ? 'New page' : 'Next page'}
          shortcut="PgDn"
          iconSize={15}
          onClick={() => (pageIndex >= pageCount - 1 ? board.addPage() : goToPage(1))}
          className="max-sm:hidden"
        />
      </div>
    </Glass>
  );
}

// ─── Top-right: history, lesson tools, share, settings ───────────────

const BACKGROUNDS: { value: Background; icon: IconName; label: string }[] = [
  { value: 'blank', icon: 'bgBlank', label: 'Blank' },
  { value: 'dots', icon: 'bgDots', label: 'Dots' },
  { value: 'grid', icon: 'bgGrid', label: 'Grid' },
  { value: 'lined', icon: 'bgLined', label: 'Lined' },
  { value: 'graph', icon: 'bgGraph', label: 'Graph' },
];

function MenuItem({ icon, label, hint, onClick }: { icon: IconName; label: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="spring flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-body text-label hover:bg-fill active:bg-fill-2">
      <Icon name={icon} size={19} className="text-tint" />
      <span className="flex-1">{label}</span>
      {hint && <span className="text-footnote text-label-2">{hint}</span>}
    </button>
  );
}

export function ActionsBar({ appearance }: { appearance: Appearance }) {
  const canUndo = useBoard((b) => b.canUndo);
  const canRedo = useBoard((b) => b.canRedo);
  const background = useBoard((b) => b.page.background);
  const timerOpen = useUI((s) => s.timerOpen);
  const curtain = useUI((s) => s.curtain.on);
  const [menu, setMenu] = useState<null | 'share' | 'paper' | 'settings'>(null);
  const shareRef = useRef<HTMLButtonElement>(null);
  const paperRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLButtonElement>(null);
  const close = () => setMenu(null);
  const toggle = (m: typeof menu) => setMenu((cur) => (cur === m ? null : m));
  const s = useUI((x) => x);

  return (
    <Glass radius={26} className="absolute top-[max(16px,env(safe-area-inset-top))] right-4 z-20" role="toolbar" aria-label="Actions">
      <div className="flex items-center gap-0.5 p-1.5">
        <ToolButton icon="undo" label="Undo" shortcut="⌘Z" disabled={!canUndo} onClick={undo} />
        <ToolButton icon="redo" label="Redo" shortcut="⇧⌘Z" disabled={!canRedo} onClick={redo} />
        <Divider />
        <ToolButton ref={paperRef} icon={BACKGROUNDS.find((b) => b.value === background)?.icon ?? 'bgDots'} label="Paper" active={menu === 'paper'} onClick={() => toggle('paper')} className="max-sm:hidden" />
        <ToolButton icon="timer" label="Session timer" active={timerOpen} onClick={() => ui.set({ timerOpen: !timerOpen })} className="max-sm:hidden" />
        <ToolButton icon="curtain" label="Reveal curtain" shortcut="C" active={curtain} onClick={() => ui.set({ curtain: { ...ui.get().curtain, on: !curtain } })} className="max-sm:hidden" />
        {channelSupported() && <ToolButton icon="present" label="Student view" onClick={openPresenter} className="max-md:hidden mobile:hidden" />}
        <span className="max-sm:hidden"><Divider /></span>
        <ToolButton ref={shareRef} icon="share" label="Share & export" active={menu === 'share'} onClick={() => toggle('share')} />
        <ToolButton ref={settingsRef} icon="settings" label="Settings" active={menu === 'settings'} onClick={() => toggle('settings')} />
      </div>

      <Popover open={menu === 'paper'} onClose={close} anchor={paperRef} placement="bottom" label="Paper" className="w-[300px] p-2">
        <p className="px-2 pt-1 pb-2 text-footnote font-semibold tracking-wide text-label-2 uppercase">Paper for this page</p>
        <div className="grid grid-cols-5 gap-1">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.value}
              type="button"
              aria-pressed={background === b.value}
              onClick={() => board.setPageProps({ background: b.value })}
              className={`spring flex flex-col items-center gap-1 rounded-2xl py-2 text-caption font-medium ${background === b.value ? 'bg-tint-soft text-tint' : 'text-label hover:bg-fill'}`}
            >
              <Icon name={b.icon} size={24} />
              {b.label}
            </button>
          ))}
        </div>
      </Popover>

      <Popover open={menu === 'share'} onClose={close} anchor={shareRef} placement="bottom" label="Share and export" className="w-[280px] p-1.5">
        <MenuItem icon="image" label="Export page as PNG" onClick={() => { close(); exportPng(appearance); }} />
        <MenuItem icon="duplicate" label="Copy page image" onClick={() => { close(); copyPng(appearance); }} />
        <MenuItem icon="present" label="Open student view" onClick={() => { close(); openPresenter(); }} />
        <div className="mx-3 my-1 h-px bg-hairline" />
        <MenuItem icon="open" label="Save lesson (.flow)" hint="⌘S" onClick={() => { close(); saveDocument(); }} />
        <MenuItem icon="share" label="Open lesson…" hint="⌘O" onClick={() => { close(); openDocument(); }} />
        <MenuItem icon="plus" label="New lesson" onClick={() => { close(); newDocument(); }} />
      </Popover>

      <Popover open={menu === 'settings'} onClose={close} anchor={settingsRef} placement="bottom" label="Settings" className="w-[340px] max-w-[calc(100vw-24px)] p-4">
        <div className="mb-3 sm:hidden">
          <p className="mb-2 text-footnote font-semibold tracking-wide text-label-2 uppercase">Paper</p>
          <Segmented<Background>
            label="Paper"
            value={background}
            onChange={(v) => board.setPageProps({ background: v })}
            options={BACKGROUNDS.map((b) => ({ value: b.value, label: <Icon name={b.icon} size={17} />, title: b.label }))}
          />
          <div className="mt-2 flex min-h-11 items-center justify-between">
            <span className="text-subhead text-label">Session timer</span>
            <Toggle checked={timerOpen} onChange={(v) => ui.set({ timerOpen: v })} label="Session timer" />
          </div>
          <div className="flex min-h-11 items-center justify-between">
            <span className="text-subhead text-label">Reveal curtain</span>
            <Toggle checked={curtain} onChange={(v) => ui.set({ curtain: { ...ui.get().curtain, on: v } })} label="Reveal curtain" />
          </div>
        </div>
        <p className="mb-2 text-footnote font-semibold tracking-wide text-label-2 uppercase">Appearance</p>
        <Segmented<AppearancePref>
          label="Appearance"
          value={s.appearance}
          onChange={(v) => ui.set({ appearance: v })}
          options={[
            { value: 'light', label: <span className="flex items-center gap-1.5"><Icon name="sun" size={15} />Light</span> },
            { value: 'dark', label: <span className="flex items-center gap-1.5"><Icon name="moon" size={15} />Dark</span> },
            { value: 'system', label: 'Auto' },
          ]}
        />
        <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
          <div>
            <p className="text-subhead text-label">Liquid Glass</p>
            <p className="text-footnote text-label-2">WebGL refraction on toolbars</p>
          </div>
          <Toggle checked={s.liquidGlass} onChange={(v) => ui.set({ liquidGlass: v })} label="Liquid Glass" />
        </div>
        <p className="mt-4 mb-2 text-footnote font-semibold tracking-wide text-label-2 uppercase">Device</p>
        <Segmented<DevicePref>
          label="Device"
          value={s.device ?? 'desktop'}
          onChange={(v) => ui.set({ device: v })}
          options={[
            { value: 'mobile', label: <span className="flex items-center gap-1.5"><Icon name="tablet" size={15} />Mobile</span> },
            { value: 'desktop', label: <span className="flex items-center gap-1.5"><Icon name="desktop" size={15} />Desktop</span> },
          ]}
        />
        <div className="mt-3 border-t border-hairline pt-3 mobile:hidden">
          <p className="mb-2 text-footnote font-semibold tracking-wide text-label-2 uppercase">Shortcuts</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-footnote">
            {[
              ['V · H', 'Select · Pan'],
              ['P · M · E', 'Pen · Highlighter · Eraser'],
              ['L', 'Laser pointer'],
              ['S · R · O · A', 'Shapes · Rect · Ellipse · Arrow'],
              ['T · N · I', 'Text · Note · Image'],
              ['Space + drag', 'Pan'],
              ['⌘ + scroll / pinch', 'Zoom'],
              ['⌘0 · ⌘1', 'Actual size · Fit'],
              ['⌘D · ⌫', 'Duplicate · Delete'],
              ['C', 'Reveal curtain'],
              ['PgUp · PgDn', 'Previous · Next page'],
            ].map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-semibold text-label tabular-nums">{k}</dt>
                <dd className="text-label-2">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Popover>
    </Glass>
  );
}

// ─── Bottom-right: zoom ──────────────────────────────────────────────

export function ZoomBar() {
  const z = useBoard((b) => b.page.camera.z);
  return (
    <Glass radius={26} className="absolute right-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-20 max-lg:hidden mobile:hidden" role="toolbar" aria-label="Zoom">
      <div className="flex items-center gap-0.5 p-1.5">
        <ToolButton icon="minus" label="Zoom out" shortcut="⌘−" iconSize={15} onClick={() => getController()?.zoomBy(1 / 1.25)} />
        <button
          type="button"
          onClick={() => getController()?.setZoom(1)}
          title="Actual size (⌘0)"
          className="spring h-11 min-w-14 rounded-full px-1 text-subhead font-semibold text-label tabular-nums hover:bg-fill"
        >
          {Math.round(z * 100)}%
        </button>
        <ToolButton icon="plus" label="Zoom in" shortcut="⌘+" iconSize={15} onClick={() => getController()?.zoomBy(1.25)} />
        <ToolButton icon="fit" label="Zoom to fit" shortcut="⌘1" iconSize={19} onClick={() => getController()?.zoomToFit()} />
      </div>
    </Glass>
  );
}

// ─── Contextual selection actions ────────────────────────────────────

export function SelectionBar() {
  const count = useUI((s) => s.selection.size);
  const tool = useUI((s) => s.tool);
  const visible = count > 0 && tool === 'select';
  return (
    <Glass
      radius={24}
      aria-hidden={!visible}
      className={`spring absolute bottom-[calc(max(16px,env(safe-area-inset-bottom))+72px)] left-1/2 z-20 -translate-x-1/2 ${visible ? 'opacity-100' : 'pointer-events-none translate-y-2 opacity-0'}`}
      role="toolbar"
      aria-label="Selection"
    >
      <div className="flex items-center gap-0.5 p-1">
        <span className="px-3 text-footnote font-semibold text-label-2 tabular-nums">{count} selected</span>
        <ToolButton icon="duplicate" label="Duplicate" shortcut="⌘D" iconSize={19} tabIndex={visible ? 0 : -1} onClick={duplicateSelection} />
        <ToolButton icon="chevronRight" label="Bring to front" shortcut="]" iconSize={14} className="-rotate-90" tabIndex={visible ? 0 : -1} onClick={() => reorderSelection(true)} />
        <ToolButton icon="chevronLeft" label="Send to back" shortcut="[" iconSize={14} className="-rotate-90" tabIndex={visible ? 0 : -1} onClick={() => reorderSelection(false)} />
        <ToolButton icon="trash" label="Delete" shortcut="⌫" iconSize={19} className="text-danger!" tabIndex={visible ? 0 : -1} onClick={deleteSelection} />
      </div>
    </Glass>
  );
}
