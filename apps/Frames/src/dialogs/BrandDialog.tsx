import { useEffect, useState } from 'react';
import { applyBrandKit, applyStyleToDraft, applyVisualStyle, instantiateComponent, saveBrandKit, saveComponent, saveVisualStyle } from '../io/libraryOps';
import { library } from '../io/library';
import type { BrandKit, SavedComponent, SavedStyle } from '../model/types';
import { Dialog } from '../ui/Dialog';
import { Btn, Empty, TextInput } from '../ui/controls';
import { doc } from '../state/session';
import { toast } from '../state/ui';
import * as cmd from '../editor/commands';

type Tab = 'styles' | 'brands' | 'components';

/** The reusable-design hub: save the look of this deck, brand kits, and component libraries. */
export default function BrandDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('styles');
  const [styles, setStyles] = useState<SavedStyle[]>([]);
  const [brands, setBrands] = useState<BrandKit[]>([]);
  const [comps, setComps] = useState<SavedComponent[]>([]);
  const [name, setName] = useState('');
  const refresh = () => {
    void library.all('styles').then(setStyles);
    void library.all('brands').then(setBrands);
    void library.all('components').then(setComps);
  };
  useEffect(refresh, []);
  const sel = cmd.selectedEls();

  return (
    <Dialog title="Styles, brand kits & components" onClose={onClose} wide>
      <div className="tabs-row">
        {(['styles', 'brands', 'components'] as Tab[]).map((t) => <button key={t} type="button" className={`chip ${tab === t ? 'on' : ''}`} onClick={() => { setTab(t); setName(''); }}>{t === 'styles' ? 'Visual styles' : t === 'brands' ? 'Brand kits' : 'Components'}</button>)}
      </div>

      {tab === 'styles' && (
        <>
          <p className="hint" style={{ marginTop: 0 }}>A visual style is this presentation’s theme, background, layouts and saved text styles. Save it, then give any other presentation the same look.</p>
          <div className="row"><TextInput label="Style name" placeholder="Name this style" value={name} onChange={setName} /><Btn variant="tint" label="Save current style" disabled={!name.trim()} onClick={async () => { await saveVisualStyle(doc.deck, name.trim()); setName(''); refresh(); toast('Style saved'); }} /></div>
          {styles.length === 0 ? <Empty icon="palette" title="No saved styles">Save this presentation’s look to reuse it.</Empty> : (
            <div className="list" style={{ marginTop: 12 }}>
              {styles.map((s) => (
                <div key={s.id} className="row">
                  <span style={{ display: 'inline-flex', gap: 2 }}>{[s.theme.colors.bg, s.theme.colors.primary, s.theme.colors.secondary, s.theme.colors.accent].map((c, i) => <i key={i} style={{ width: 14, height: 14, borderRadius: 4, background: c, border: '1px solid rgba(128,128,128,.4)' }} />)}</span>
                  <span className="grow list-item" style={{ flex: 1 }}>{s.name} <small>{s.theme.fonts.heading} / {s.theme.fonts.body}</small></span>
                  <Btn size="sm" label="Apply to this deck" onClick={async () => { const metas = await applyVisualStyle(s); doc.commit('Apply visual style', (d) => applyStyleToDraft(d, s, metas)); toast(`Applied “${s.name}”`); }} />
                  <Btn size="sm" icon="trash" title="Delete" onClick={() => void library.remove('styles', s.id).then(refresh)} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'brands' && (
        <>
          <p className="hint" style={{ marginTop: 0 }}>A brand kit remembers your colours and fonts. Applying one recolours the theme, so everything using theme colours follows.</p>
          <div className="row"><TextInput label="Brand name" placeholder="Brand name" value={name} onChange={setName} /><Btn variant="tint" label="Save from this theme" disabled={!name.trim()} onClick={async () => { await saveBrandKit(doc.deck, name.trim()); setName(''); refresh(); toast('Brand kit saved'); }} /></div>
          {brands.length === 0 ? <Empty icon="palette" title="No brand kits yet">Set your colours and fonts in the Slide tab, then save them here.</Empty> : (
            <div className="list" style={{ marginTop: 12 }}>
              {brands.map((k) => (
                <div key={k.id} className="row">
                  <span style={{ display: 'inline-flex', gap: 2 }}>{k.colors.map((c, i) => <i key={i} style={{ width: 14, height: 14, borderRadius: 4, background: c, border: '1px solid rgba(128,128,128,.4)' }} />)}</span>
                  <span className="grow list-item" style={{ flex: 1 }}>{k.name} <small>{k.fonts.heading} / {k.fonts.body}</small></span>
                  <Btn size="sm" label="Apply" onClick={() => { doc.commit('Apply brand kit', (d) => applyBrandKit(d, k)); toast(`Applied “${k.name}”`); }} />
                  <Btn size="sm" icon="trash" title="Delete" onClick={() => void library.remove('brands', k.id).then(refresh)} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'components' && (
        <>
          <p className="hint" style={{ marginTop: 0 }}>Components are objects (or groups) you reuse: a logo lockup, a stat card, a footer.</p>
          <div className="row"><TextInput label="Component name" placeholder={sel.length === 1 ? 'Name the selected object' : 'Select one object or a group first'} value={name} onChange={setName} /><Btn variant="tint" label="Save selection" disabled={!name.trim() || sel.length !== 1} onClick={async () => { await saveComponent(doc.deck, sel[0]!, name.trim()); setName(''); refresh(); toast('Component saved'); }} /></div>
          {comps.length === 0 ? <Empty icon="group" title="No components yet">Select an object or group, name it, and save it.</Empty> : (
            <div className="list" style={{ marginTop: 12 }}>
              {comps.map((c) => (
                <div key={c.id} className="row">
                  <span className="grow list-item" style={{ flex: 1 }}>{c.name} <small>{c.library} · {c.el.type}</small></span>
                  <Btn size="sm" label="Insert" onClick={async () => { const r = await instantiateComponent(c); doc.commit('Add component assets', (d) => { Object.assign(d.assets, r.assets); }); cmd.insert([r.el], 'Add component'); onClose(); }} />
                  <Btn size="sm" icon="trash" title="Delete" onClick={() => void library.remove('components', c.id).then(refresh)} />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}
