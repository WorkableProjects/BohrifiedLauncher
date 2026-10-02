import type { Appearance } from '../engine/theme';
import { redo, undo } from '../state/actions';
import { useBoard } from '../state/board';
import { Glass } from './Glass';
import { ToolButton } from './controls';
import { ToolDock } from './ToolDock';
import { SelectionBar, ZoomBar } from './Bars';

/**
 * What a device sees once the tutor lets it draw: the tool dock, undo / redo, zoom and the
 * selection bar. No lesson menus, sharing or export: those belong to the tutor.
 */
export function GuestTools({ appearance }: { appearance: Appearance }) {
  const canUndo = useBoard((b) => b.canUndo);
  const canRedo = useBoard((b) => b.canRedo);
  return (
    <>
      <Glass radius={26} className="absolute top-[max(16px,env(safe-area-inset-top))] right-4 z-20" role="toolbar" aria-label="Undo and redo">
        <div className="flex items-center gap-0.5 p-1.5">
          <ToolButton icon="undo" label="Undo" disabled={!canUndo} onClick={undo} />
          <ToolButton icon="redo" label="Redo" disabled={!canRedo} onClick={redo} />
        </div>
      </Glass>
      <SelectionBar />
      <ToolDock appearance={appearance} />
      <ZoomBar />
    </>
  );
}
