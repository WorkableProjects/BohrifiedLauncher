import { isJoinMessage, liveBackend, parseJoinInput, type JoinState } from '@bohrified/app-sdk';
import { el } from '@bohrified/utilities';
import { joinPagePath, navigate, navigateJoin } from './router';

/**
 * Join Whiteboard: a student enters a tutor's session code (or pastes the
 * link) and watches that tutor's Flow whiteboard. The board itself is
 * Flow's read-only viewer in a frame; this page owns everything around it:
 * the code form, the connection state, who the tutor is, and Leave / Rejoin.
 * It is not an app in the registry: leaving removes the frame, which frees
 * the viewer completely.
 */

const STATE: Record<JoinState, { label: string; tone: 'ok' | 'wait' | 'bad'; help: string }> = {
  connecting: { label: 'Connecting', tone: 'wait', help: 'Reaching the tutor’s whiteboard…' },
  waiting: { label: 'Waiting for tutor', tone: 'wait', help: 'The board appears as soon as the tutor starts sharing.' },
  live: { label: 'Live', tone: 'ok', help: 'You’re watching in real time. You can’t edit the board.' },
  paused: { label: 'Paused', tone: 'wait', help: 'The tutor paused sharing. It resumes automatically.' },
  reconnecting: { label: 'Reconnecting', tone: 'wait', help: 'Your connection dropped. Trying again…' },
  ended: { label: 'Session ended', tone: 'bad', help: 'The tutor stopped sharing.' },
  'not-found': { label: 'Session not found', tone: 'bad', help: 'Check the code with your tutor. The session may have ended.' },
  unavailable: { label: 'Not available', tone: 'bad', help: 'This copy of Bohrified isn’t connected to a live-session service.' },
  error: { label: 'Couldn’t connect', tone: 'bad', help: 'Something went wrong reaching the session service.' },
};

export interface JoinPage {
  /** Show the page, connecting straight away when the URL carries a code. */
  show(code: string | null): void;
  hide(): void;
}

export function createJoinPage(root: HTMLElement, opts: { base: string; configured: boolean }): JoinPage {
  const spaced = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;
  let frame: HTMLIFrameElement | null = null;
  let onMessage: ((e: MessageEvent) => void) | null = null;
  let session: { code: string; state: JoinState; title?: string; tutor?: string } | null = null;

  function stop() {
    if (onMessage) removeEventListener('message', onMessage);
    onMessage = null;
    // Navigate away first so the viewer's socket closes before the frame is detached.
    if (frame) {
      try {
        frame.src = 'about:blank';
      } catch { /* ignore */ }
      frame.remove();
    }
    frame = null;
    session = null;
  }

  function renderForm(prefill = '', error = '') {
    stop();
    const input = el('input', {
      id: 'join-code',
      type: 'text',
      className: 'field join-input',
      value: prefill,
      placeholder: 'K7Q X2M',
      autocomplete: 'off',
      spellcheck: false,
      autocapitalize: 'characters',
      ariaLabel: 'Session code or link',
      maxLength: 200,
    });
    if (error) input.setAttribute('aria-invalid', 'true');
    const msg = el('p', { className: 'join-error', role: 'alert', textContent: error });
    const submit = () => {
      const code = parseJoinInput(input.value);
      if (!code) {
        input.setAttribute('aria-invalid', 'true');
        msg.textContent = 'That doesn’t look like a session code. It’s 6 letters and numbers, like K7QX2M.';
        input.focus();
        return;
      }
      navigateJoin(code);
    };
    input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    input.addEventListener('input', () => {
      input.removeAttribute('aria-invalid');
      msg.textContent = '';
    });
    root.replaceChildren(
      el(
        'div',
        { className: 'join-card' },
        el('h1', { textContent: 'Join Whiteboard' }),
        el('p', { className: 'lede', textContent: 'Enter the code your tutor gave you, or paste their link.' }),
        el('label', { htmlFor: 'join-code', className: 'join-label', textContent: 'Session code or link' }),
        input,
        msg,
        el('button', { type: 'button', className: 'primary join-go', textContent: 'Join', disabled: !opts.configured, onclick: submit }),
        ...(opts.configured ? [] : [el('p', { className: 'join-note', textContent: 'Live sessions aren’t set up for this copy of Bohrified yet. Ask whoever runs it to add a session service.' })]),
        el('p', { className: 'join-note', textContent: 'You’ll watch your tutor’s whiteboard live. You can’t change it.' }),
        el('a', { href: opts.base, className: 'join-back', textContent: 'Back to Bohrified', onclick: (e: Event) => (e.preventDefault(), navigate(null)) }),
      ),
    );
    queueMicrotask(() => input.focus());
  }

  function renderSession(code: string) {
    stop();
    session = { code, state: opts.configured ? 'connecting' : 'unavailable' };
    const pill = el('span', { className: 'join-pill', role: 'status', ariaLive: 'polite' });
    const identity = el('span', { className: 'join-identity' });
    const help = el('p', { className: 'join-help', ariaLive: 'polite' });
    const rejoin = el('button', { type: 'button', className: 'plain', textContent: 'Rejoin', onclick: () => start() });
    const leave = el('button', { type: 'button', className: 'plain', textContent: 'Leave', onclick: () => navigateJoin(null) });
    const stageEl = el('div', { className: 'join-stage' });

    const paint = () => {
      if (!session) return;
      const s = STATE[session.state];
      pill.textContent = s.label;
      pill.dataset.tone = s.tone;
      help.textContent = s.help;
      identity.textContent = [`Session ${spaced(session.code)}`, session.tutor && `Tutor ${session.tutor}`, session.title].filter(Boolean).join(' · ');
      // Rejoin is for sessions that are over or stuck, not for ones working fine.
      rejoin.hidden = !(['ended', 'error', 'not-found', 'reconnecting', 'unavailable'] as JoinState[]).includes(session.state);
      document.title = `${session.title ?? 'Join Whiteboard'} · Bohrified`;
    };

    function start() {
      if (!session) return;
      if (onMessage) removeEventListener('message', onMessage);
      frame?.remove();
      session.state = opts.configured ? 'connecting' : 'unavailable';
      paint();
      if (!opts.configured) return;
      const f = el('iframe', {
        title: `Tutor whiteboard, session ${session.code}`,
        src: `${opts.base}apps/flow/?view=join&code=${session.code}`,
        className: 'join-frame',
      });
      frame = f;
      stageEl.append(f);
      onMessage = (e: MessageEvent) => {
        if (e.origin !== location.origin || e.source !== f.contentWindow || !isJoinMessage(e.data) || !session) return;
        session.state = e.data.state;
        session.title = e.data.title ?? session.title;
        session.tutor = e.data.tutor ?? session.tutor;
        paint();
      };
      addEventListener('message', onMessage);
    }

    root.replaceChildren(
      el('div', { className: 'join-bar' }, el('div', { className: 'join-meta' }, identity, pill), el('div', { className: 'row join-actions' }, rejoin, leave)),
      help,
      stageEl,
    );
    start();
  }

  return {
    show(code) {
      root.hidden = false;
      document.title = 'Join Whiteboard · Bohrified';
      if (!code) return renderForm();
      const normalized = parseJoinInput(code);
      if (!normalized) return renderForm(code, 'That doesn’t look like a session code. Check it and try again.');
      if (session?.code === normalized) return;
      renderSession(normalized);
    },
    hide() {
      stop();
      root.hidden = true;
      root.replaceChildren();
    },
  };
}

export const joinConfigured = (raw: string | undefined) => !!liveBackend(raw, { dev: import.meta.env.DEV, origin: location.origin, protocol: location.protocol, hostname: location.hostname });
export { joinPagePath };
