import { PREFS_META, type Prefs } from '../state/prefsSchema';
import { prefs, setPrefs, setTheme, usePrefs, type PrefsState } from '../state/prefs';
import { Dialog } from '../ui/Dialog';
import { Seg, Toggle } from '../ui/controls';
import { cleanUpMedia } from '../state/session';
import { toast, ui } from '../state/ui';
import { Btn } from '../ui/controls';

const GROUPS = ['Interface', 'Editing', 'Export', 'Presenting'] as const;

/**
 * Frames' preferences. They are the same values Bohrified's settings sheet
 * shows for Frames (one list, one storage key), so a change here appears there
 * immediately and the other way round. Appearance is Bohrified's own.
 */
export function PrefsDialog({ onClose }: { onClose: () => void }) {
  const p = usePrefs((s) => s) as PrefsState;
  void prefs;
  return (
    <Dialog title="Preferences" onClose={onClose}>
      <div className="setting">
        <div><b>Appearance</b><p>Shared with Bohrified: change it here or in Bohrified’s settings.</p></div>
        <Seg value={p.theme} label="Appearance" onChange={setTheme} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
      </div>
      {GROUPS.map((g) => (
        <section key={g}>
          <h3 style={{ margin: '22px 0 0', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--label-2)' }}>{g}</h3>
          {PREFS_META.filter((m) => m.group === g).map((m) => (
            <div key={m.id} className="setting">
              <div><b>{m.label}</b><p>{m.description}</p></div>
              {m.kind === 'toggle'
                ? <Toggle label={m.label} value={!!p[m.id]} onChange={(v) => setPrefs({ [m.id]: v } as Partial<Prefs>)} />
                : <Seg value={String(p[m.id])} label={m.label} onChange={(v) => setPrefs({ [m.id]: v } as Partial<Prefs>)} options={m.options ?? []} />}
            </div>
          ))}
        </section>
      ))}
      <section>
        <h3 style={{ margin: '22px 0 0', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--label-2)' }}>Storage</h3>
        <div className="setting">
          <div><b>Remove unused media</b><p>Deletes images and videos in this presentation that no slide uses. This clears undo history.</p></div>
          <Btn className="ghost" variant="ghost" label="Clean up" disabled={ui.get().screen !== 'editor'} onClick={async () => { const n = await cleanUpMedia(); toast(n ? `Removed ${n} unused file${n === 1 ? '' : 's'}` : 'Nothing to remove'); }} />
        </div>
      </section>
    </Dialog>
  );
}
