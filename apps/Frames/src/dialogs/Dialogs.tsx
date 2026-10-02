import { lazy, Suspense } from 'react';
import { useStore } from '../state/store';
import { ui } from '../state/ui';
import { ExportDialog } from './ExportDialog';
import { PrefsDialog } from './PrefsDialog';
import { ShortcutsDialog } from './ShortcutsDialog';

const TemplatesDialog = lazy(() => import('./TemplatesDialog'));
const TransitionDialog = lazy(() => import('./TransitionDialog'));
const BrandDialog = lazy(() => import('./BrandDialog'));

/** Routes the single open dialog. Heavier ones load on first use. */
export function Dialogs() {
  const d = useStore(ui, (s) => s.dialog);
  const close = () => ui.set({ dialog: null });
  return (
    <Suspense fallback={null}>
      {d === 'export' && <ExportDialog onClose={close} />}
      {d === 'prefs' && <PrefsDialog onClose={close} />}
      {d === 'shortcuts' && <ShortcutsDialog onClose={close} />}
      {d === 'templates' && <TemplatesDialog onClose={close} />}
      {d === 'transition' && <TransitionDialog onClose={close} />}
      {d === 'brand' && <BrandDialog onClose={close} />}
    </Suspense>
  );
}
