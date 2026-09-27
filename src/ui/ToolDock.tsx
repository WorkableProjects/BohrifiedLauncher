import { useRef, useState } from 'react';
import type { IconName } from '../icons/Icon';
import { Icon } from '../icons/Icon';
import { swatch, type Appearance } from '../engine/theme';
import type { Tool } from '../engine/types';
import { pickImage } from '../state/actions';
import { setTool, ui, useUI, type UIState } from '../state/ui';
import { Divider, ToolButton } from './controls';
import { Glass } from './Glass';
import { Inspector, SHAPES } from './Inspector';

const TOOLS: { tool: Tool; icon: IconName; label: string; key: string }[] = [
  { tool: 'select', icon: 'select', label: 'Select', key: 'V' },
  { tool: 'hand', icon: 'hand', label: 'Pan', key: 'H' },
];

const INK: { tool: Tool; icon: IconName; label: string; key: string }[] = [
  { tool: 'pen', icon: 'pen', label: 'Pen', key: 'P' },
  { tool: 'highlighter', icon: 'highlighter', label: 'Highlighter', key: 'M' },
  { tool: 'eraser', icon: 'eraser', label: 'Eraser', key: 'E' },
  { tool: 'laser', icon: 'laser', label: 'Laser pointer', key: 'L' },
  { tool: 'shape', icon: 'shapes', label: 'Shapes', key: 'S' },
  { tool: 'text', icon: 'text', label: 'Text', key: 'T' },
  { tool: 'note', icon: 'note', label: 'Sticky note', key: 'N' },
];

/** The color the well shows for the current tool. */
function currentColor(s: UIState): string | null {
  switch (s.tool) {
    case 'pen':
    case 'select':
    case 'hand':
      return s.pen.color;
    case 'highlighter':
      return s.highlighter.color;
    case 'shape':
      return s.shape.color;
    case 'text':
      return s.text.color;
    case 'note':
      return s.noteTint;
    default:
      return null;
  }
}

/** Primary floating tool palette — bottom centre, Liquid Glass. */
export function ToolDock({ appearance }: { appearance: Appearance }) {
  const tool = useUI((s) => s.tool);
  const shapeKind = useUI((s) => s.shapeKind);
  const color = useUI(currentColor);
  const [inspector, setInspector] = useState(false);
  const wellRef = useRef<HTMLButtonElement>(null);

  const choose = (t: Tool) => {
    // Tapping the active drawing tool opens its options (Apple Notes pattern).
    if (t === tool && t !== 'select' && t !== 'hand' && t !== 'laser') setInspector((v) => !v);
    else {
      setTool(t);
      setInspector(false);
    }
  };

  const shapeIcon = SHAPES.find((s) => s.kind === shapeKind)?.icon ?? 'shapes';

  return (
    <Glass
      radius={30}
      className="absolute bottom-[max(16px,env(safe-area-inset-bottom))] left-1/2 z-20 max-w-[calc(100vw-32px)] -translate-x-1/2"
      role="toolbar"
      aria-label="Tools"
    >
      <div className="flex items-center gap-0.5 overflow-x-auto p-1.5 [scrollbar-width:none]">
        {TOOLS.map((t) => (
          <ToolButton key={t.tool} icon={t.icon} label={t.label} shortcut={t.key} active={tool === t.tool} onClick={() => choose(t.tool)} />
        ))}
        <Divider />
        {INK.map((t) => (
          <ToolButton
            key={t.tool}
            icon={t.tool === 'shape' ? shapeIcon : t.icon}
            label={t.label}
            shortcut={t.key}
            active={tool === t.tool}
            onClick={() => choose(t.tool)}
          />
        ))}
        <ToolButton icon="image" label="Insert image" shortcut="I" onClick={pickImage} />
        <Divider />
        <button
          ref={wellRef}
          type="button"
          aria-label="Color and size"
          title="Color and size"
          onClick={() => setInspector((v) => !v)}
          className="spring flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-fill active:scale-[0.92]"
        >
          {color ? (
            <span
              className="block h-7 w-7 rounded-full shadow-[inset_0_0_0_2px_rgba(255,255,255,0.9),0_0_0_1px_var(--hairline)]"
              style={{ background: swatch(color, appearance) }}
            />
          ) : (
            <Icon name="more" size={22} />
          )}
        </button>
      </div>
      <Inspector open={inspector} onClose={() => setInspector(false)} anchor={wellRef} appearance={appearance} />
    </Glass>
  );
}

export const selectToolByKey = (key: string): boolean => {
  const all = [...TOOLS, ...INK];
  const hit = all.find((t) => t.key.toLowerCase() === key.toLowerCase());
  if (hit) {
    setTool(hit.tool);
    return true;
  }
  const shape = SHAPES.find((s) => s.key?.toLowerCase() === key.toLowerCase());
  if (shape) {
    ui.set({ tool: 'shape', shapeKind: shape.kind, selection: new Set() });
    return true;
  }
  return false;
};
