import { Dialog } from '../ui/Dialog';
import { SHORTCUT_GROUPS, shortcutLabel } from '../editor/shortcuts';

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Keyboard shortcuts" onClose={onClose} wide>
      <div className="kbd-grid">
        {SHORTCUT_GROUPS.map((g) => (
          <section key={g.name} className="kbd-group">
            <h4>{g.name}</h4>
            {g.items.map((it) => (
              <div key={it.label} className="kbd-row"><span>{it.label}</span><kbd>{it.action ? shortcutLabel(it.action) : it.keys}</kbd></div>
            ))}
          </section>
        ))}
      </div>
    </Dialog>
  );
}
