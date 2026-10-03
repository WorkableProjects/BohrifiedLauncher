import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Btn } from '../ui/controls';
import { activate } from '../state/session';
import { toast } from '../state/ui';
import spec from '../../../../docs/frames-outline.md?raw';

/** Paste a Frames outline (usually written by an AI assistant) and turn it into a deck. */
export default function OutlineDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const build = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { extractOutlineJson, importOutline } = await import('../io/importOutline');
      const { deck, warnings } = await importOutline(extractOutlineJson(text));
      onClose();
      activate(deck);
      if (warnings.length) toast(`Built ${deck.slides.length} slides. Skipped: ${warnings.slice(0, 2).join('; ')}${warnings.length > 2 ? '…' : ''}`, 7000);
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  const copySpec = async () => {
    try {
      await navigator.clipboard.writeText(spec);
      toast('Instructions copied. Paste them into your AI, then describe your presentation.');
    } catch {
      const blob = new Blob([spec], { type: 'text/markdown' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'frames-outline.md' });
      a.click();
      URL.revokeObjectURL(a.href);
    }
  };

  return (
    <Dialog
      title="Create from AI"
      onClose={onClose}
      wide
      footer={<>
        <Btn label="Copy AI instructions" icon="copy" variant="ghost" onClick={() => void copySpec()} />
        <span style={{ flex: 1 }} />
        <Btn label="Cancel" variant="ghost" onClick={onClose} />
        <Btn label={busy ? 'Building…' : 'Build presentation'} variant="tint" disabled={busy || !text.trim()} onClick={() => void build()} />
      </>}
    >
      <ol className="hint" style={{ margin: '0 0 12px', paddingLeft: 18, lineHeight: 1.6 }}>
        <li>Click <b>Copy AI instructions</b> and paste them into any AI chat.</li>
        <li>Tell it what the presentation is about.</li>
        <li>Paste its whole reply below.</li>
      </ol>
      <textarea
        className="text-in"
        aria-label="Outline"
        data-testid="outline-text"
        spellCheck={false}
        style={{ width: '100%', minHeight: 280, fontFamily: 'var(--mono, Menlo, monospace)', fontSize: 12 }}
        placeholder='{ "frames": 1, "title": "…", "slides": [ … ] }'
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {err && <p role="alert" style={{ color: 'var(--danger, #ff3b30)', margin: '8px 0 0' }}>{err}</p>}
    </Dialog>
  );
}
