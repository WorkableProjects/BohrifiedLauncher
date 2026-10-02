import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeSessionCode, type JoinMessage, type JoinState } from '@bohrified/app-sdk';
import { BoardCanvas } from './canvas/BoardCanvas';
import { getController } from './canvas/instance';
import { followCamera, LOCAL_CHANNEL, ViewerSync, type SyncMessage } from './engine/sync';
import { CLOSE_NOT_FOUND, channelTransport, type Transport } from './engine/transport';
import { useAppearance } from './hooks/useAppearance';
import { liveRelay, openLiveTransport } from './state/live';
import { board, useBoard } from './state/board';
import { Glass } from './ui/Glass';
import { GlassProvider } from './ui/GlassProvider';
import { useUI } from './state/ui';

/** What the student sees for each state of the connection to the tutor. */
const MESSAGE: Partial<Record<JoinState, [string, string]>> = {
  connecting: ['Connecting…', 'Reaching the tutor’s whiteboard.'],
  waiting: ['Waiting for the tutor…', 'The whiteboard appears as soon as they start sharing.'],
  paused: ['Paused by the tutor', 'You’ll see the board again when they resume.'],
  reconnecting: ['Reconnecting…', 'Your connection dropped. Trying again.'],
  ended: ['Session ended', 'The tutor stopped sharing.'],
  'not-found': ['Session not found', 'Check the code with your tutor. It may have ended.'],
  unavailable: ['Live sessions aren’t available', 'This copy of Bohrified isn’t connected to a session service.'],
  error: ['Couldn’t connect', 'Something went wrong reaching the session service.'],
};

/**
 * Student / share view: a chrome-free, read-only mirror of the tutor's
 * board that follows their page, camera, ink and spotlight in real time.
 *
 *   ?view=present            a window on the tutor's own computer (BroadcastChannel)
 *   ?view=join&code=K7QX2M   a student on another device, through the session relay
 *
 * Students can't edit: there are no tools or shortcuts here and the canvas is read-only.
 * When embedded in Bohrified's Join Whiteboard page it reports its state to that page.
 */
export function PresenterApp() {
  const appearance = useAppearance();
  const liquid = useUI((s) => s.liquidGlass && s.device !== 'mobile');
  const stage = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<JoinState>('connecting');
  const title = useBoard((b) => b.doc.title);
  const pageName = useBoard((b) => b.page.name);
  const [tutor, setTutor] = useState<string | undefined>();
  const last = useRef<{ cam: { x: number; y: number; z: number }; w: number; h: number } | null>(null);
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const joining = params.get('view') === 'join';
  const code = joining ? normalizeSessionCode(params.get('code') ?? '') : null;

  const report = (next: JoinState, extra: Partial<JoinMessage> = {}) => {
    setState(next);
    try {
      if (window.parent !== window) window.parent.postMessage({ bohrJoin: 1, state: next, ...extra } satisfies JoinMessage, location.origin);
    } catch { /* not embedded */ }
  };

  useEffect(() => {
    document.title = joining ? 'Flow — Join Whiteboard' : 'Flow — Student View';
    let transport: Transport<SyncMessage>;
    if (joining) {
      if (!code) return report('not-found');
      const live = liveRelay() && openLiveTransport(code, 'student');
      if (!live) return report('unavailable');
      transport = live;
    } else transport = channelTransport<SyncMessage>(LOCAL_CHANNEL);

    const apply = () => {
      const c = getController();
      const l = last.current;
      if (!c || !l) return;
      const { width, height } = c.viewport;
      board.setCamera(followCamera(l.cam, l.w, l.h, width, height));
    };
    const sync = new ViewerSync(
      board,
      {
        onCamera: (cam, w, h) => {
          last.current = { cam, w, h };
          apply();
        },
        onPresence: (p) => getController()?.setRemotePresence(p),
        onConnected: () => {},
        onStatus: (s) => {
          setTutor(s.tutor);
          const extra = { title: s.title, tutor: s.tutor, page: board.page.name };
          if (s.link === 'refused') return report(s.detail === String(CLOSE_NOT_FOUND) ? 'not-found' : 'error', extra);
          if (s.link === 'connecting') return report('connecting', extra);
          if (s.link === 'reconnecting' || s.link === 'closed') return report('reconnecting', extra);
          report(s.state === 'waiting' ? 'waiting' : s.state, extra);
        },
      },
      transport,
    );
    window.addEventListener('resize', apply);
    return () => {
      sync.destroy();
      window.removeEventListener('resize', apply);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showing = state === 'live' || state === 'paused' || state === 'reconnecting' || state === 'ended';
  const note = MESSAGE[state];
  const dot = state === 'live' ? 'bg-[#34C759]' : state === 'paused' || state === 'reconnecting' ? 'bg-[#FF9500]' : 'bg-label-3';

  return (
    <GlassProvider root={stage} enabled={liquid}>
      <main ref={stage} className="fixed inset-0 overflow-hidden select-none" data-liquid="off">
        <BoardCanvas appearance={appearance} readOnly />
        <Glass radius={20} className="absolute top-4 left-4 z-20">
          <div className="flex h-10 items-center gap-2 px-4" role="status" aria-live="polite">
            <span className={`h-2 w-2 rounded-full ${dot}`} />
            <span className="text-subhead font-semibold tracking-title text-label">{showing ? title : (note?.[0] ?? 'Connecting…')}</span>
            {showing && tutor && <span className="text-subhead text-label-2">· {tutor}</span>}
            {showing && <span className="text-subhead text-label-2">· {pageName}</span>}
          </div>
        </Glass>
        {note && showing && state !== 'live' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-8 z-20 flex justify-center">
            <Glass radius={22}>
              <div className="px-5 py-3 text-center">
                <p className="text-headline font-semibold text-label">{note[0]}</p>
                <p className="text-footnote text-label-2">{note[1]}</p>
              </div>
            </Glass>
          </div>
        )}
        {!showing && note && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-bg">
            <div className="max-w-sm px-6 text-center">
              <p className="text-title3 font-semibold text-label">{note[0]}</p>
              <p className="mt-1 text-subhead text-label-2">{note[1]}</p>
            </div>
          </div>
        )}
      </main>
    </GlassProvider>
  );
}
