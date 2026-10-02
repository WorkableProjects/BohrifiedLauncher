import { useStore } from '../state/store';
import { ui } from '../state/ui';

export function Toast() {
  const t = useStore(ui, (s) => s.toast);
  if (!t) return null;
  return <div key={t.id} className="toast" role="status" aria-live="polite">{t.text}</div>;
}
