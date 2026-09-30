import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { bohr } from './bohr';
import { Root } from './Root';
import { PresenterApp } from './PresenterApp';
import { board } from './state/board';

declare global {
  interface Window {
    __flowBoard?: typeof board;
  }
}
// Benchmark hook (scripts/perf.mjs): exposes the store only when asked.
if (new URLSearchParams(location.search).has('bench')) window.__flowBoard = board;

const presenting = new URLSearchParams(location.search).get('view') === 'present';

/** A render crash: inside Bohrified the launcher shows Reload / Back; standalone, offer a reload. */
class CrashBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    bohr?.reportError(error, true);
  }
  render() {
    if (!this.state.error) return this.props.children;
    if (bohr) return null;
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-grouped text-label">
        <p className="text-headline">Flow hit a problem. Your lessons are saved.</p>
        <button type="button" className="rounded-full bg-tint px-4 py-2 text-on-tint" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashBoundary>{presenting ? <PresenterApp /> : <Root />}</CrashBoundary>
  </StrictMode>,
);
