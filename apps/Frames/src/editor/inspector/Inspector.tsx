import { Seg } from '../../ui/controls';
import { useStore } from '../../state/store';
import { ui, type InspectorTab } from '../../state/ui';
import { AnimateTab } from './AnimateTab';
import { ArrangeTab } from './ArrangeTab';
import { DesignTab } from './DesignTab';
import { SlideTab } from './SlideTab';

export function Inspector() {
  const tab = useStore(ui, (s) => s.inspector);
  return (
    <aside className="inspector" aria-label="Inspector">
      <div className="insp-tabs">
        <Seg<InspectorTab> value={tab} label="Inspector" onChange={(inspector) => ui.set({ inspector })} options={[{ value: 'design', label: 'Design' }, { value: 'arrange', label: 'Arrange' }, { value: 'animate', label: 'Animate' }, { value: 'slide', label: 'Slide' }]} />
      </div>
      <div className="insp-body">
        {tab === 'design' && <DesignTab />}
        {tab === 'arrange' && <ArrangeTab />}
        {tab === 'animate' && <AnimateTab />}
        {tab === 'slide' && <SlideTab />}
      </div>
    </aside>
  );
}
