import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { PresenterApp } from './PresenterApp';
import { loadAutosave } from './engine/persistence';
import { board } from './state/board';

declare global {
  interface Window {
    __flowBoard?: typeof board;
  }
}
// Benchmark hook (scripts/perf.mjs): exposes the store only when asked.
if (new URLSearchParams(location.search).has('bench')) window.__flowBoard = board;

const presenting = new URLSearchParams(location.search).get('view') === 'present';

async function boot() {
  if (!presenting) {
    const saved = await loadAutosave();
    if (saved) board.load(saved);
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>{presenting ? <PresenterApp /> : <App />}</StrictMode>,
  );
}

boot();
