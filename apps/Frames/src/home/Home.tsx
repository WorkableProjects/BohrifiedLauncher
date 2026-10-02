import { useCallback, useEffect, useRef, useState } from 'react';
import { listDecks, deleteDeck, type DeckSummary } from '../io/library';
import { importDeckFile } from '../io/importAny';
import { newPresentation, open, duplicateDeck } from '../app/flow';
import { Btn, Empty } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { ContextMenu, type MenuItem } from '../ui/Menu';
import { activate } from '../state/session';
import { toast, ui } from '../state/ui';
import { exportDeckProject } from '../io/exporters';

const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: s > 31536000 ? 'numeric' : undefined });
};

export function Home() {
  const [decks, setDecks] = useState<DeckSummary[] | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; deck: DeckSummary } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = useCallback(() => void listDecks().then(setDecks), []);
  useEffect(refresh, [refresh]);

  const doImport = async (files: File[]) => {
    for (const f of files) {
      setBusy(`Importing ${f.name}…`);
      try {
        const { deck, warnings } = await importDeckFile(f, (d, t) => setBusy(`Importing ${f.name} (${d}/${t})…`));
        activate(deck);
        if (warnings.length) toast(`Imported. ${warnings.length} thing${warnings.length > 1 ? 's' : ''} couldn't be kept (${warnings[0]}).`, 6000);
        break;
      } catch (e) {
        toast((e as Error).message || 'That file could not be imported.', 5000);
      }
    }
    setBusy(null);
  };

  const items = (d: DeckSummary): MenuItem[] => [
    { label: 'Open', icon: 'folder', onClick: () => void open(d.id) },
    { label: 'Duplicate', icon: 'duplicate', onClick: () => void duplicateDeck(d.id).then(refresh) },
    { label: 'Download .frames file', icon: 'download', onClick: () => void exportDeckProject(d.id) },
    { divider: true },
    { label: 'Delete', icon: 'trash', danger: true, onClick: () => { if (confirm(`Delete “${d.title}”? This can't be undone.`)) void deleteDeck(d.id).then(refresh); } },
  ];

  return (
    <div
      className="home"
      data-testid="home"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); const f = [...e.dataTransfer.files]; if (f.length) void doImport(f); }}
    >
      <div className="home-in">
        <h1><img src="./favicon.svg" width="40" height="40" alt="" /> Frames</h1>
        <p className="sub">Presentations with motion built in.</p>
        <div className="home-actions">
          <Btn icon="plus" label="Blank presentation" variant="tint" onClick={() => void newPresentation()} />
          <Btn icon="template" label="Templates" className="ghost" variant="ghost" onClick={() => ui.set({ dialog: 'templates' })} />
          <Btn icon="sparkles" label="Create from AI" variant="ghost" onClick={() => ui.set({ dialog: 'import' })} />
          <Btn icon="upload" label="Import…" variant="ghost" onClick={() => fileRef.current?.click()} />
          <input ref={fileRef} type="file" hidden accept=".frames,.pptx,.pdf,.json,image/*,.svg" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ''; if (f.length) void doImport(f); }} />
          <Btn icon="settings" label="Preferences" variant="ghost" onClick={() => ui.set({ dialog: 'prefs' })} />
        </div>

        <h3>Recent</h3>
        {decks === null ? <div className="spinner" role="status" aria-label="Loading" /> : decks.length === 0 ? (
          <Empty icon="slides" title="No presentations yet">Start with a blank deck or pick a template. You can also drop a PowerPoint, PDF or image here.</Empty>
        ) : (
          <div className="cards">
            {decks.map((d) => (
              <div key={d.id} className="card-wrap" data-testid="deck-card" onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, deck: d }); }}>
                <button type="button" className="card" style={{ width: '100%' }} onClick={() => void open(d.id)} aria-label={`Open ${d.title}`}>
                  <div className="cover">{d.thumb ? <img src={d.thumb} alt="" /> : <Icon name="slides" size={32} />}</div>
                  <b>{d.title}</b>
                  <small>{d.slides} slide{d.slides === 1 ? '' : 's'} · {ago(d.updated)}</small>
                </button>
                <button type="button" className="btn plain sm more" aria-label={`More for ${d.title}`} onClick={(e) => setMenu({ x: e.clientX, y: e.clientY, deck: d })}><Icon name="more" size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      <ContextMenu at={menu} items={menu ? items(menu.deck) : []} onClose={() => setMenu(null)} />
      {busy && <div className="loading"><div style={{ display: 'grid', gap: 10, justifyItems: 'center' }}><div className="spinner" /><span>{busy}</span></div></div>}
    </div>
  );
}
