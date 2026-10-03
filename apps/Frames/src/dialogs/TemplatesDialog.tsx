import { useEffect, useRef, useState } from 'react';
import { BUILTIN_TEMPLATES, type BuiltinTemplate } from '../templates/builtin';
import { SLIDE_RECIPES, type SlideRecipe } from '../templates/slides';
import { deckFromTemplate, saveDeckTemplate, saveSlideTemplate, slideFromTemplate } from '../io/libraryOps';
import { library } from '../io/library';
import { renderSlide } from '../io/exporters';
import * as ops from '../model/ops';
import type { Deck, SavedTemplate, Slide } from '../model/types';
import { newPresentation } from '../app/flow';
import { activate, assets, createDeck, currentSlide, doc, saveNow } from '../state/session';
import { toast, ui } from '../state/ui';
import { Dialog } from '../ui/Dialog';
import { Btn, Empty, TextInput } from '../ui/controls';
import { AssetStore } from '../render/assets';
import * as cmd from '../editor/commands';
import { cloneSlide } from '../model/defaults';

type Tab = 'presentations' | 'slides' | 'mine';

/** A cover image: slide `slide` of `deck`, drawn lazily when it scrolls into view. */
function Cover({ deck, slide, store }: { deck: Deck; slide: Slide; store: AssetStore }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver((e) => setVis(e.some((x) => x.isIntersecting)), { rootMargin: '120px' });
    if (box.current) io.observe(box.current);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!vis) return;
    let live = true;
    void renderSlide(deck, slide, 420, store).then((c) => {
      if (!live || !ref.current) return;
      ref.current.width = c.width;
      ref.current.height = c.height;
      ref.current.getContext('2d')!.drawImage(c as CanvasImageSource, 0, 0);
    });
    return () => { live = false; };
  }, [vis, deck, slide, store]);
  return <div ref={box} className="cover" style={{ aspectRatio: `${deck.size.w} / ${deck.size.h}` }}>{vis && <canvas ref={ref} />}</div>;
}

export default function TemplatesDialog({ onClose }: { onClose: () => void }) {
  const inEditor = ui.get().screen === 'editor';
  const [tab, setTab] = useState<Tab>('presentations');
  const made = useRef<Map<string, Deck>>(new Map()).current;
  const [mine, setMine] = useState<SavedTemplate[] | null>(null);
  const [name, setName] = useState('');
  const store = assets;
  const refresh = () => void library.all('templates').then(setMine);
  useEffect(refresh, []);

  const deckOf = (t: BuiltinTemplate): Deck => {
    let d = made.get(t.id);
    if (!d) {
      d = t.make();
      made.set(t.id, d);
    }
    return d;
  };

  const startFrom = async (d: Deck) => {
    onClose();
    await newPresentation(d);
  };

  const insertRecipe = (r: SlideRecipe) => {
    const cur = currentSlide();
    if (!cur) return;
    const s = r.make(doc.deck.theme, doc.deck.size);
    doc.commit(`Add ${r.name}`, (d) => { ops.insertSlides(d, [s], d.slides.findIndex((x) => x.id === cur.id) + 1); });
    cmd.selectSlide(s.id);
    onClose();
  };

  const useMine = async (t: SavedTemplate) => {
    if (t.kind === 'presentation') {
      const d = await deckFromTemplate(t);
      if (d) await startFrom(d);
    } else if (t.kind === 'slide' && inEditor) {
      const r = await slideFromTemplate(t);
      const cur = currentSlide();
      if (!r || !cur) return;
      doc.commit('Add slide template', (d) => {
        Object.assign(d.assets, r.assets);
        ops.insertSlides(d, [cloneSlide(r.slide)], d.slides.findIndex((x) => x.id === cur.id) + 1);
      });
      onClose();
    } else toast('Open a presentation to use a slide template.');
  };

  const theme = doc.deck.theme;
  const size = doc.deck.size;

  return (
    <Dialog title="Templates" wide onClose={onClose}>
      <div className="tabs-row">
        <button type="button" className={`chip ${tab === 'presentations' ? 'on' : ''}`} onClick={() => setTab('presentations')}>Presentations</button>
        <button type="button" className={`chip ${tab === 'slides' ? 'on' : ''}`} onClick={() => setTab('slides')}>Slides</button>
        <button type="button" className={`chip ${tab === 'mine' ? 'on' : ''}`} onClick={() => setTab('mine')}>Mine</button>
      </div>

      {tab === 'presentations' && (
        <div className="cards">
          {BUILTIN_TEMPLATES.map((t) => (
            <button key={t.id} type="button" className="card template-card" onClick={() => void startFrom(t.make())} aria-label={`New presentation from ${t.name}`}>
              <Cover deck={deckOf(t)} slide={deckOf(t).slides[0]!} store={store} />
              <b>{t.name}</b><small>{t.description}</small>
            </button>
          ))}
        </div>
      )}

      {tab === 'slides' && (inEditor ? (
        <>
          <p className="hint" style={{ marginTop: 0 }}>Slides take on this presentation’s colours and fonts. Click to add one after the current slide.</p>
          <div className="cards">
            {SLIDE_RECIPES.map((r) => {
              const s = r.make(theme, size);
              return (
                <button key={r.id} type="button" className="card template-card" onClick={() => insertRecipe(r)} aria-label={`Add ${r.name}`}>
                  <Cover deck={doc.deck} slide={s} store={store} />
                  <b>{r.name}</b><small>{r.category}</small>
                </button>
              );
            })}
          </div>
        </>
      ) : <Empty icon="slides" title="Open a presentation first">Slide templates are added to the presentation you are editing.</Empty>)}

      {tab === 'mine' && (
        <>
          {inEditor && (
            <div className="row" style={{ marginBottom: 14 }}>
              <TextInput label="Template name" placeholder="Name your template" value={name} onChange={setName} />
              <Btn size="sm" label="Save this presentation" disabled={!name.trim()} className="ghost" variant="ghost" onClick={async () => { await saveNow(); await saveDeckTemplate(doc.deck, name.trim()); setName(''); refresh(); toast('Saved as a presentation template'); }} />
              <Btn size="sm" label="Save this slide" disabled={!name.trim()} className="ghost" variant="ghost" onClick={async () => { const s = currentSlide(); if (s) { await saveSlideTemplate(doc.deck, s, name.trim()); setName(''); refresh(); toast('Saved as a slide template'); } }} />
            </div>
          )}
          {mine === null ? <div className="spinner" /> : mine.length === 0 ? <Empty icon="template" title="Nothing saved yet">{inEditor ? 'Name this presentation or slide above to keep it as a template.' : 'Open a presentation to save a template.'}</Empty> : (
            <div className="cards">
              {mine.map((t) => (
                <div key={t.id} className="card-wrap">
                  <button type="button" className="card template-card" onClick={() => void useMine(t)}>
                    <MineCover t={t} store={store} />
                    <b>{t.name}</b><small>{t.kind === 'presentation' ? 'Presentation' : 'Slide'} · {new Date(t.created).toLocaleDateString()}</small>
                  </button>
                  <button type="button" className="btn plain sm more" aria-label={`Delete ${t.name}`} onClick={() => void library.remove('templates', t.id).then(refresh)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <span hidden>{createDeck.name}{activate.name}</span>
    </Dialog>
  );
}

function MineCover({ t, store }: { t: SavedTemplate; store: AssetStore }) {
  const deck = t.deck ?? ({ ...doc.deck, theme: t.theme ?? doc.deck.theme } as Deck);
  const slide = t.deck?.slides[0] ?? t.slide;
  if (!slide) return null;
  return <Cover deck={deck} slide={slide} store={store} />;
}
