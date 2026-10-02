import { useRef, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Btn, Seg } from '../ui/controls';
import { Icon } from '../ui/Icon';
import { downloadBlob, runExport, type ExportFormat, type ExportRange } from '../io/exporters';
import { doc, saveNow } from '../state/session';
import { prefs, setPrefs } from '../state/prefs';
import { toast, ui } from '../state/ui';

const FORMATS: { id: ExportFormat; label: string; sub: string; icon: string }[] = [
  { id: 'pdf', label: 'PDF', sub: 'Every slide as a page', icon: 'file' },
  { id: 'png', label: 'PNG', sub: 'Lossless pictures', icon: 'image' },
  { id: 'jpg', label: 'JPG', sub: 'Small pictures', icon: 'image' },
  { id: 'video', label: 'Video', sub: 'Plays the whole show', icon: 'film' },
  { id: 'html', label: 'Web page', sub: 'Animated, one file', icon: 'globe' },
  { id: 'frames', label: 'Frames file', sub: 'Editable project', icon: 'folder' },
];

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const p = prefs.get();
  const [format, setFormat] = useState<ExportFormat>(p.exportFormat as ExportFormat);
  const [range, setRange] = useState<ExportRange>('all');
  const [scale, setScale] = useState<'1' | '2'>(p.exportScale);
  const [quality, setQuality] = useState<'standard' | 'high'>(p.exportQuality);
  const [fps, setFps] = useState<'30' | '60'>('30');
  const [busy, setBusy] = useState<{ done: number; total: number; label?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const deck = doc.deck;
  const u = ui.get();
  const slidesFor = () => {
    if (range === 'current') return deck.slides.filter((s) => s.id === u.slideId);
    if (range === 'selected') return deck.slides.filter((s) => u.slideSel.includes(s.id));
    return deck.slides;
  };
  const slideBased = format === 'png' || format === 'jpg' || format === 'pdf';

  const go = async () => {
    setError(null);
    abort.current = new AbortController();
    setBusy({ done: 0, total: 1 });
    try {
      await saveNow();
      const res = await runExport(deck, slidesFor(), { format, scale: scale === '2' ? 2 : 1, quality, fps: fps === '60' ? 60 : 30 }, (done, total, label) => setBusy({ done, total, label }), abort.current.signal);
      setPrefs({ exportFormat: format, exportScale: scale, exportQuality: quality });
      downloadBlob(res.blob, res.name);
      toast(`Exported ${res.name}`);
      onClose();
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message || 'Export failed.');
      setBusy(null);
    }
  };

  return (
    <Dialog title="Export" onClose={() => { abort.current?.abort(); onClose(); }} footer={
      busy ? <Btn label="Cancel" onClick={() => abort.current?.abort()} /> : <><Btn label="Cancel" onClick={onClose} /><Btn variant="tint" icon="download" label="Export" onClick={go} /></>
    }>
      <div className="export-grid" role="group" aria-label="Format">
        {FORMATS.map((f) => (
          <button key={f.id} type="button" className="export-opt" aria-pressed={format === f.id} disabled={!!busy} onClick={() => setFormat(f.id)}>
            <Icon name={f.icon} size={20} /><b>{f.label}</b><small>{f.sub}</small>
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 14, marginTop: 18 }}>
        {slideBased && (
          <div className="setting"><b>Slides</b><Seg value={range} label="Slides" onChange={setRange} options={[{ value: 'all', label: `All ${deck.slides.length}` }, { value: 'current', label: 'This slide' }, { value: 'selected', label: `Selected ${u.slideSel.length}` }]} /></div>
        )}
        {(slideBased || format === 'video') && (
          <div className="setting"><b>Quality</b><Seg value={quality} label="Quality" onChange={setQuality} options={[{ value: 'high', label: 'High' }, { value: 'standard', label: 'Standard' }]} /></div>
        )}
        {slideBased && (
          <div className="setting"><b>Size</b><Seg value={scale} label="Size" onChange={setScale} options={[{ value: '1', label: `1× · ${deck.size.w}px` }, { value: '2', label: `2× · ${deck.size.w * 2}px` }]} /></div>
        )}
        {format === 'video' && (
          <div className="setting"><div><b>Frame rate</b><p>The show is recorded as it plays, builds and transitions included, so it takes as long as the presentation does.</p></div><Seg value={fps} label="Frame rate" onChange={setFps} options={[{ value: '30', label: '30 fps' }, { value: '60', label: '60 fps' }]} /></div>
        )}
        {format === 'html' && <p className="hint">A single .html file that plays the presentation with all its animations and transitions, with no internet needed.</p>}
        {format === 'frames' && <p className="hint">A .frames file holds the full presentation and its media. Open it in Frames on any computer.</p>}
      </div>
      {busy && (
        <div style={{ marginTop: 18 }} role="status" aria-live="polite">
          <div className="progress-bar"><i style={{ width: `${Math.round((busy.done / Math.max(1, busy.total)) * 100)}%` }} /></div>
          <p className="hint">{busy.label ?? 'Working…'} {busy.total > 1 ? `(${busy.done}/${busy.total})` : ''}</p>
        </div>
      )}
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
    </Dialog>
  );
}
