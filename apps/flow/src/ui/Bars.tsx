import { useEffect, useRef, useState } from 'react';
import { getController } from '../canvas/instance';
import { Icon, type IconName } from '../icons/Icon';
import type { Appearance } from '../engine/theme';
import type { Background } from '../engine/types';
import {
  alignSelection,
  copyPng,
  deleteSelection,
  distributeSelection,
  duplicateSelection,
  exportPng,
  goToPage,
  newDocument,
  openDocument,
  redo,
  reorderSelection,
  saveDocument,
  toggleSpotlight,
  undo,
} from '../state/actions';
import type { AlignMode } from '../engine/arrange';
import { board, useBoard } from '../state/board';
import { useLive } from '../state/live';
import { openChemistry, openEquation, openSharing, setTool, ui, useUI, type AppearancePref, type DevicePref } from '../state/ui';
import { markIsOn, setMark, spansOf, withSpans } from '../engine/richtext';
import type { EquationElement, TextElement } from '../engine/types';
import { FormatButtons, FORMATS, type FormatSpec, type MarkState } from './FormatBar';
import { channelSupported } from '../engine/transport';
import { BubbleGroup } from './Bubble';
import { AccentPicker, Divider, Segmented, Toggle, ToolButton } from './controls';
import { Glass } from './Glass';
import { Logo } from './Logo';
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
          <Logo size={30} />
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

/** A tile in the Apps menu: colored symbol, name, and live state. */
function AppTile({ icon, color, label, detail, on, shortcut, onClick }: { icon: IconName; color: string; label: string; detail: string; on?: boolean; shortcut?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={`spring flex min-h-[76px] flex-col items-start justify-between gap-2 rounded-[16px] p-3 text-left active:scale-[0.96] ${on ? 'bg-tint-soft' : 'bg-fill hover:bg-fill-2'}`}
    >
      <span className="flex w-full items-center justify-between">
        <span className="flex h-8 w-8 items-center justify-center rounded-[9px] text-white" style={{ background: color }}>
          <Icon name={icon} size={17} />
        </span>
        {on && <Icon name="checkFill" size={18} className="text-tint" />}
      </span>
      <span>
        <span className={`block text-subhead leading-tight font-semibold ${on ? 'text-on-tint-soft' : 'text-label'}`}>{label}</span>
        <span className={`block text-caption ${on ? 'text-on-tint-soft' : 'text-label-2'}`}>{detail}</span>
      </span>
    </button>
  );
}

export function ActionsBar({ appearance }: { appearance: Appearance }) {
  const canUndo = useBoard((b) => b.canUndo);
  const canRedo = useBoard((b) => b.canRedo);
  const undoLabel = useBoard((b) => b.undoLabel);
  const redoLabel = useBoard((b) => b.redoLabel);
  const undoDepth = useBoard((b) => b.undoDepth);
  const redoDepth = useBoard((b) => b.redoDepth);
  const spotlight = useUI((s) => s.spotlight);
  const sharingOpen = useUI((s) => s.sharingOpen);
  const viewers = useLive((s) => s.viewers);
  const background = useBoard((b) => b.page.background);
  const timerOpen = useUI((s) => s.timerOpen);
  const curtain = useUI((s) => s.curtain.on);
  const [menu, setMenu] = useState<null | 'share' | 'paper' | 'settings' | 'apps'>(null);
  const shareRef = useRef<HTMLButtonElement>(null);
  const appsRef = useRef<HTMLButtonElement>(null);
  const paperRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLButtonElement>(null);
  const close = () => setMenu(null);
  const toggle = (m: typeof menu) => setMenu((cur) => (cur === m ? null : m));
  const s = useUI((x) => x);

  return (
    <Glass radius={26} className="absolute top-[max(16px,env(safe-area-inset-top))] right-4 z-20" role="toolbar" aria-label="Actions">
      <div className="flex items-center gap-0.5 p-1.5">
        {/* The tooltip names what the click would do, with how many steps are available. */}
        <ToolButton icon="undo" label={undoLabel ? `Undo ${undoLabel}` : 'Undo'} shortcut={`⌘Z${undoDepth ? ` · ${undoDepth} step${undoDepth === 1 ? '' : 's'}` : ''}`} disabled={!canUndo} onClick={undo}>
          {undoDepth > 0 && <span aria-hidden className="pointer-events-none absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-fill-2 px-1 text-center text-[10px] leading-4 font-semibold text-label-2 tabular-nums">{undoDepth > 99 ? '99+' : undoDepth}</span>}
        </ToolButton>
        <ToolButton icon="redo" label={redoLabel ? `Redo ${redoLabel}` : 'Redo'} shortcut={`⇧⌘Z${redoDepth ? ` · ${redoDepth} step${redoDepth === 1 ? '' : 's'}` : ''}`} disabled={!canRedo} onClick={redo} />
        <Divider />
        <ToolButton ref={paperRef} icon={BACKGROUNDS.find((b) => b.value === background)?.icon ?? 'bgDots'} label="Paper" active={menu === 'paper'} onClick={() => toggle('paper')} className="max-sm:hidden" />
        {channelSupported() && (
          <ToolButton icon="present" label={viewers ? `Student view · ${viewers} watching` : 'Student view'} active={sharingOpen} onClick={() => (sharingOpen ? ui.set({ sharingOpen: false }) : openSharing())} className="max-md:hidden mobile:hidden">
            {viewers > 0 && <span aria-hidden className="pointer-events-none absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-[#34C759] px-1 text-center text-[10px] leading-4 font-semibold text-white tabular-nums">{viewers}</span>}
          </ToolButton>
        )}
        <ToolButton ref={appsRef} icon="apps" label="Apps" iconSize={19} active={menu === 'apps'} onClick={() => toggle('apps')}>
          {(timerOpen || curtain) && menu !== 'apps' && <span aria-hidden className="absolute top-2 right-2 h-2 w-2 rounded-full bg-tint shadow-[0_0_0_2px_var(--bg)]" />}
        </ToolButton>
        <Divider />
        <ToolButton ref={shareRef} icon="share" label="Share & export" active={menu === 'share'} onClick={() => toggle('share')} />
        <ToolButton ref={settingsRef} icon="settings" label="Settings" active={menu === 'settings'} onClick={() => toggle('settings')} />
      </div>

      <Popover open={menu === 'apps'} onClose={close} anchor={appsRef} placement="bottom" label="Apps" className="w-[320px] max-w-[calc(100vw-24px)] p-2">
        <p className="px-2 pt-1 pb-2 text-footnote font-semibold tracking-wide text-label-2 uppercase">Apps</p>
        <div className="grid grid-cols-2 gap-1.5 [&>*:last-child:nth-child(odd)]:col-span-2">
          <AppTile icon="timer" color="#FF9500" label="Timer" detail={timerOpen ? 'On' : 'Countdown'} on={timerOpen} onClick={() => ui.set({ timerOpen: !timerOpen })} />
          <AppTile icon="curtain" color="#5856D6" label="Screen Hider" detail={curtain ? 'On' : 'Reveal steps'} on={curtain} shortcut="C" onClick={() => ui.set({ curtain: { ...ui.get().curtain, on: !curtain } })} />
          <AppTile icon="equation" color="var(--brand)" label="LaTeX Equation" detail="Typeset math" onClick={() => { close(); openEquation(); }} />
          <AppTile icon="atom" color="#34C759" label="Chemistry Tools" detail="Periodic table, models & more" onClick={() => { close(); openChemistry(); }} />
          <AppTile icon="eye" color="#FF3B30" label="Spotlight" detail={spotlight ? 'On' : 'Dim all but one area'} on={spotlight} shortcut="F" onClick={() => { close(); toggleSpotlight(); }} />
          <AppTile icon="textBox" color="#007AFF" label="Text" detail="Rich text & notes" shortcut="T" onClick={() => { close(); setTool(ui.get().textKind); }} />
        </div>
      </Popover>

      <Popover open={menu === 'paper'} onClose={close} anchor={paperRef} placement="bottom" label="Paper" className="w-[300px] p-2">
        <p className="px-2 pt-1 pb-2 text-footnote font-semibold tracking-wide text-label-2 uppercase">Paper for this page</p>
        <BubbleGroup active={background} variant="soft" className="grid grid-cols-5 gap-1 [&>span]:rounded-2xl!">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.value}
              type="button"
              aria-pressed={background === b.value}
              data-bubble={b.value}
              onClick={() => board.setPageProps({ background: b.value })}
              className={`spring relative flex flex-col items-center gap-1 rounded-2xl py-2 text-caption font-medium ${background === b.value ? 'text-on-tint-soft' : 'text-label hover:bg-fill'}`}
            >
              <Icon name={b.icon} size={24} />
              {b.label}
            </button>
          ))}
        </BubbleGroup>
      </Popover>

      <Popover open={menu === 'share'} onClose={close} anchor={shareRef} placement="bottom" label="Share and export" className="w-[280px] p-1.5">
        <MenuItem icon="image" label="Export page as PNG" onClick={() => { close(); exportPng(appearance); }} />
        <MenuItem icon="duplicate" label="Copy page image" onClick={() => { close(); copyPng(appearance); }} />
        <MenuItem icon="present" label="Student view & live session…" onClick={() => { close(); openSharing(); }} />
        <div className="mx-3 my-1 h-px bg-hairline" />
        <MenuItem icon="keyboard" label="Keyboard shortcuts" hint="?" onClick={() => { close(); ui.set({ shortcutsOpen: true }); }} />
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
        <p className="mt-4 mb-2 text-footnote font-semibold tracking-wide text-label-2 uppercase">Accent</p>
        <AccentPicker />
        <div className="mt-3 flex min-h-11 items-center justify-between gap-3 mobile:hidden">
          <div>
            <p className="text-subhead text-label">Liquid Glass</p>
            <p className="text-footnote text-label-2">WebGL refraction on toolbars</p>
          </div>
          <Toggle checked={s.liquidGlass} onChange={(v) => ui.set({ liquidGlass: v })} label="Liquid Glass" />
        </div>
        <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
          <div>
            <p className="text-subhead text-label">Snap to objects</p>
            <p className="text-footnote text-label-2">Guides when moving; hold Alt to move freely</p>
          </div>
          <Toggle checked={s.snapObjects} onChange={(v) => ui.set({ snapObjects: v })} label="Snap to objects" />
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

const ALIGN: { mode: AlignMode; label: string }[] = [
  { mode: 'left', label: 'Align left' },
  { mode: 'center', label: 'Align centers' },
  { mode: 'right', label: 'Align right' },
  { mode: 'top', label: 'Align top' },
  { mode: 'middle', label: 'Align middles' },
  { mode: 'bottom', label: 'Align bottom' },
];

export function SelectionBar() {
  const arrangeRef = useRef<HTMLButtonElement>(null);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const selection = useUI((s) => s.selection);
  const tool = useUI((s) => s.tool);
  const elements = useBoard((b) => b.page.elements);
  const count = selection.size;
  const visible = count > 0 && tool === 'select';
  const tab = visible ? 0 : -1;

  // Contextual actions: formatting for text, re-editing for an equation.
  const selected = elements.filter((e) => selection.has(e.id));
  const texts = selected.filter((e): e is TextElement => e.type === 'text');
  const allText = texts.length > 0 && texts.length === selected.length;
  const equation = selected.length === 1 && selected[0].type === 'equation' ? (selected[0] as EquationElement) : null;
  const marks: MarkState = {};
  if (allText) for (const f of FORMATS) marks[f.mark] = texts.every((t) => markIsOn(spansOf(t), f.mark));
  const toggle = (f: FormatSpec) => board.replaceElements(texts.map((t) => withSpans(t, setMark(spansOf(t), f.mark, !marks[f.mark]))));

  return (
    <Glass
      radius={24}
      aria-hidden={!visible}
      className={`spring absolute bottom-[calc(max(16px,env(safe-area-inset-bottom))+72px)] left-1/2 z-20 -translate-x-1/2 ${visible ? 'opacity-100' : 'pointer-events-none translate-y-2 opacity-0'}`}
      role="toolbar"
      aria-label="Selection"
    >
      <div className="flex items-center gap-0.5 p-1">
        <span className="px-3 text-footnote font-semibold whitespace-nowrap text-label-2 tabular-nums">{count} selected</span>
        {allText && (
          <>
            <FormatButtons state={marks} onToggle={toggle} tabIndex={tab} />
            <Divider />
          </>
        )}
        {equation && (
          <>
            <button
              type="button"
              tabIndex={tab}
              onClick={() => openEquation(equation.id)}
              className="spring flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-subhead font-semibold text-tint hover:bg-fill active:scale-[0.94]"
            >
              <Icon name="equation" size={17} /> Edit
            </button>
            <Divider />
          </>
        )}
        {count > 1 && (
          <>
            <button
              ref={arrangeRef}
              type="button"
              tabIndex={tab}
              aria-haspopup="dialog"
              aria-expanded={arrangeOpen}
              onClick={() => setArrangeOpen((o) => !o)}
              className={`spring flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-subhead font-semibold hover:bg-fill active:scale-[0.94] ${arrangeOpen ? 'bg-fill text-label' : 'text-tint'}`}
            >
              <Icon name="more" size={17} /> Arrange
            </button>
            <Divider />
          </>
        )}
        <ToolButton icon="duplicate" label="Duplicate" shortcut="⌘D" iconSize={19} tabIndex={tab} onClick={duplicateSelection} />
        <ToolButton icon="chevronRight" label="Bring to front" shortcut="]" iconSize={14} className="-rotate-90" tabIndex={tab} onClick={() => reorderSelection(true)} />
        <ToolButton icon="chevronLeft" label="Send to back" shortcut="[" iconSize={14} className="-rotate-90" tabIndex={tab} onClick={() => reorderSelection(false)} />
        <ToolButton icon="trash" label="Delete" shortcut="⌫" iconSize={19} className="text-danger!" tabIndex={tab} onClick={deleteSelection} />
      </div>
      <Popover open={arrangeOpen && visible && count > 1} onClose={() => setArrangeOpen(false)} anchor={arrangeRef} placement="top" label="Arrange" className="w-[300px] p-2">
        <p className="px-2 pt-1 pb-2 text-footnote font-semibold tracking-wide text-label-2 uppercase">Align {count} items</p>
        <div className="grid grid-cols-3 gap-1.5">
          {ALIGN.map((a) => (
            <button key={a.mode} type="button" onClick={() => alignSelection(a.mode)} className="spring min-h-11 rounded-xl bg-fill px-2 text-subhead font-semibold text-label hover:bg-fill-2 active:scale-[0.96]">
              {a.label.replace('Align ', '')}
            </button>
          ))}
        </div>
        <p className="px-2 pt-3 pb-2 text-footnote font-semibold tracking-wide text-label-2 uppercase">Distribute</p>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" disabled={count < 3} onClick={() => distributeSelection('x')} className="spring min-h-11 rounded-xl bg-fill px-2 text-subhead font-semibold text-label hover:bg-fill-2 active:scale-[0.96] disabled:opacity-35">Horizontally</button>
          <button type="button" disabled={count < 3} onClick={() => distributeSelection('y')} className="spring min-h-11 rounded-xl bg-fill px-2 text-subhead font-semibold text-label hover:bg-fill-2 active:scale-[0.96] disabled:opacity-35">Vertically</button>
        </div>
        {count < 3 && <p className="px-2 pt-2 text-footnote text-label-2">Select three or more to distribute.</p>}
      </Popover>
    </Glass>
  );
}
