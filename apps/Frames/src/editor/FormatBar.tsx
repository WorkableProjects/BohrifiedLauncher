import { useStore } from '../state/store';
import { ui } from '../state/ui';
import { useSel } from './inspector/common';
import { TextControls } from './inspector/TextControls';

/** A slim text-formatting strip that appears only when text is selected or being edited. */
export function FormatBar() {
  const editing = useStore(ui, (s) => s.editing);
  const { els } = useSel();
  const textual = els.some((e) => e.type === 'text' || (e.type === 'shape' && !!e.doc));
  if (!(editing?.type === 'text' || textual)) return null;
  return (
    <div className="formatbar" role="toolbar" aria-label="Text formatting">
      <TextControls compact />
    </div>
  );
}
