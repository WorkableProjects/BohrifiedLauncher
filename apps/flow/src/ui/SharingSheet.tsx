import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from '../hooks/usePresence';
import { endLiveSession, localAddress, setLiveMode, setSharing, shareLink, startLiveSession, useLive } from '../state/live';
import { openPresenter } from '../state/actions';
import { toast, ui, useUI } from '../state/ui';
import { ToolButton, Toggle } from './controls';

const LINK_LABEL = {
  off: '',
  connecting: 'Connecting…',
  open: 'Connected',
  reconnecting: 'Reconnecting…',
  closed: 'Disconnected',
  refused: 'The session service refused the connection',
} as const;

/** The code, spaced for reading aloud: "K7Q X2M". */
const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

/**
 * Student view and live session. The tutor opens a student window on this
 * computer, or starts a session with a code that students enter on
 * Bohrified's Join Whiteboard page. Pausing freezes what students see while
 * the tutor prepares the next step.
 */
export function SharingSheet() {
  const open = useUI((s) => s.sharingOpen);
  const timerOpen = useUI((s) => s.timerOpen);
  const { mounted, leaving } = usePresence(open);
  const live = useLive((s) => s);
  const sheet = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const [local, setLocal] = useState<{ host: string; port: string; hint?: boolean } | null>(null);
  const localMode = live.mode === 'local';

  // "Same network" needs this computer's address; ask for it when that choice is showing.
  useEffect(() => {
    if (!open || !localMode) return;
    let alive = true;
    localAddress().then((a) => alive && setLocal(a));
    return () => {
      alive = false;
    };
  }, [open, localMode]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => sheet.current?.focus());
  }, [open]);

  if (!mounted) return null;
  const close = () => ui.set({ sharingOpen: false });
  const link = live.code ? shareLink(live.code, live.mode, local) : '';

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast(`Copied ${what}`);
    } catch {
      toast('Copy isn’t available here');
    }
  };

  return createPortal(
    <section
      ref={sheet}
      tabIndex={-1}
      role="dialog"
      aria-label="Student view"
      className={`sheet ${leaving ? 'pop-out' : 'pop-in'} fixed right-4 z-40 flex max-h-[calc(100dvh-96px)] w-[400px] max-w-[calc(100vw-32px)] flex-col overflow-y-auto p-4 outline-none [&>*]:shrink-0 max-sm:right-3`}
      style={{ top: `calc(max(16px, env(safe-area-inset-top)) + ${timerOpen ? 136 : 72}px)`, ['--origin' as string]: '100% 0%' }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
      }}
    >
      <header className="flex items-center gap-3">
        <h2 className="flex-1 text-headline font-semibold tracking-title">Student view</h2>
        <span className="flex items-center gap-1.5 rounded-full bg-fill px-3 py-1 text-footnote font-semibold text-label tabular-nums" aria-live="polite">
          <span className={`h-2 w-2 rounded-full ${live.viewers ? 'bg-[#34C759]' : 'bg-label-3'}`} />
          {live.viewers} watching
        </span>
        <ToolButton icon="close" label="Close" iconSize={12} onClick={close} />
      </header>

      <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
        <div>
          <p className="text-subhead font-semibold text-label">Share with students</p>
          <p className="text-footnote text-label-2">{live.sharing === 'paused' ? 'Paused: students see their last view' : 'Students follow your page, ink and spotlight'}</p>
        </div>
        <Toggle checked={live.sharing === 'live'} onChange={(on) => setSharing(on ? 'live' : 'paused')} label="Share with students" />
      </div>

      <div className="mt-3 rounded-[16px] bg-fill p-3">
        <p className="text-subhead font-semibold text-label">On this computer</p>
        <p className="text-footnote text-label-2">A clean window to share in a video call.</p>
        <button type="button" onClick={openPresenter} className="spring mt-2 h-10 rounded-full bg-fill-2 px-4 text-subhead font-semibold text-label hover:brightness-95 active:scale-[0.97]">
          Open student window
        </button>
      </div>

      <div className="mt-3 rounded-[16px] bg-fill p-3">
        <p className="text-subhead font-semibold text-label">From another device</p>
        {!live.configured ? (
          <p className="mt-1 text-footnote text-label-2">Live sessions aren’t set up for this copy of Bohrified. An administrator can add a session service; see docs/live-sessions.md.</p>
        ) : !live.code ? (
          <>
            <div role="radiogroup" aria-label="Where to share" className="mt-2 grid grid-cols-2 gap-1 rounded-full bg-fill-2 p-1">
              {([['online', 'Online'], ['local', 'Same network']] as const).map(([m, label]) => (
                <button key={m} type="button" role="radio" aria-checked={live.mode === m} onClick={() => setLiveMode(m)} className={`spring h-9 rounded-full text-subhead font-semibold ${live.mode === m ? 'bg-tint text-on-tint' : 'text-label'}`}>
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-footnote text-label-2">
              {localMode
                ? 'For people in the same room or on the same Wi-Fi or hotspot. They enter your address, port and code on the Join Whiteboard page, or open the link. Needs Flow running on this computer (npm run serve).'
                : 'For video calls and other networks. Anyone with the code can join at the Bohrified site. They can watch, not edit.'}
            </p>
            <button type="button" onClick={startLiveSession} className="spring mt-2 h-10 rounded-full bg-tint px-4 text-subhead font-semibold text-on-tint hover:brightness-105 active:scale-[0.97]">
              Start live session
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-caption text-label-2">Session code</p>
            <p className="text-largeTitle font-bold tracking-[0.12em] text-label tabular-nums" aria-label={`Session code ${live.code.split('').join(' ')}`} style={{ fontSize: 34 }}>{spaced(live.code)}</p>
            {live.mode === 'local' && (
              local ? (
                <p className="mt-1 text-footnote text-label-2">Address <b className="text-label">{local.host}</b> · Port <b className="text-label">{local.port}</b>{local.hint ? ' · open Flow at this address so the link below works for others' : ''}</p>
              ) : (
                <p className="mt-1 text-footnote text-label-2">Couldn’t find this computer’s network address. Start Flow with npm run serve, which prints it.</p>
              )
            )}
            {link && <p className="mt-1 truncate text-footnote text-label-2" title={link}>{link}</p>}
            <p className="mt-1 text-footnote text-label-2" role="status">
              {LINK_LABEL[live.link]}
              {live.link === 'open' && live.sharing === 'paused' ? ' · paused' : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" onClick={() => copy(live.code!, 'code')} className="spring h-10 rounded-full bg-fill-2 px-4 text-subhead font-semibold text-label hover:brightness-95 active:scale-[0.97]">{copied ? 'Copied' : 'Copy code'}</button>
              <button type="button" disabled={!link} onClick={() => copy(link, 'link')} className="spring h-10 rounded-full bg-fill-2 px-4 text-subhead font-semibold text-label hover:brightness-95 active:scale-[0.97]">Copy link</button>
              <button type="button" onClick={endLiveSession} className="spring h-10 rounded-full px-4 text-subhead font-semibold text-danger hover:bg-fill-2 active:scale-[0.97]">End session</button>
            </div>
            <p className="mt-2 text-caption text-label-3">Students see your first name and the lesson title. Ending the session tells everyone it’s over.</p>
          </>
        )}
      </div>
    </section>,
    document.getElementById('overlay') ?? document.body,
  );
}
