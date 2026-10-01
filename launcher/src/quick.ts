import { el } from '@bohrified/utilities';
import { score } from './library';

/**
 * The Cmd/Ctrl + K quick launcher: type to filter apps and commands, arrow
 * keys to move, Enter to run, Escape to dismiss. It is a combobox over a
 * listbox so screen readers announce the highlighted result.
 */

export interface QuickItem {
  id: string;
  label: string;
  /** Right-aligned secondary text (a shortcut, "Paused"…). */
  hint?: string;
  /** Extra words that should match. */
  keywords?: string;
  icon?: string;
  group: 'Apps' | 'Windows' | 'Bohrified';
  run: () => void;
}

export interface QuickLauncher {
  open(): void;
  close(): void;
  toggle(): void;
  readonly isOpen: boolean;
}

export function rank(query: string, items: readonly QuickItem[]): QuickItem[] {
  if (!query.trim()) return [...items];
  const best = (item: QuickItem) => {
    const byLabel = score(query, item.label);
    return Math.max(byLabel ? byLabel + 10 : 0, item.keywords ? score(query, item.keywords) : 0);
  };
  return items
    .map((item, i) => ({ item, i, s: best(item) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item);
}

export function createQuickLauncher(dialog: HTMLDialogElement, items: () => QuickItem[], baseUrl: string): QuickLauncher {
  const input = el('input', {
    type: 'text',
    className: 'quick-input',
    placeholder: 'Search apps and commands',
    autocomplete: 'off',
    spellcheck: false,
    role: 'combobox',
    ariaLabel: 'Search apps and commands',
  });
  input.setAttribute('aria-expanded', 'true');
  input.setAttribute('aria-controls', 'quick-list');
  input.setAttribute('aria-autocomplete', 'list');
  const list = el('div', { id: 'quick-list', className: 'quick-list', role: 'listbox', ariaLabel: 'Results' });
  const empty = el('p', { className: 'quick-empty', textContent: 'Nothing matches.', hidden: true });
  dialog.replaceChildren(input, list, empty);

  let shown: QuickItem[] = [];
  let index = 0;

  const choose = (i: number) => {
    const item = shown[i];
    if (!item) return;
    close();
    item.run();
  };

  function highlight(next: number) {
    index = shown.length ? (next + shown.length) % shown.length : 0;
    list.querySelectorAll<HTMLElement>('[role=option]').forEach((node, i) => {
      node.setAttribute('aria-selected', String(i === index));
      if (i === index) {
        input.setAttribute('aria-activedescendant', node.id);
        node.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function render() {
    shown = rank(input.value, items());
    empty.hidden = shown.length > 0;
    let group = '';
    list.replaceChildren(
      ...shown.flatMap((item, i) => {
        const node = el(
          'div',
          { id: `quick-${i}`, className: 'quick-item', role: 'option', onclick: () => choose(i), onpointermove: () => index !== i && highlight(i) },
          item.icon ? el('img', { src: baseUrl + item.icon, alt: '', width: 24, height: 24, className: 'app-icon', draggable: false }) : el('span', { className: 'quick-glyph', ariaHidden: 'true', textContent: '›' }),
          el('span', { className: 'quick-label', textContent: item.label }),
          ...(item.hint ? [el('span', { className: 'quick-hint', textContent: item.hint })] : []),
        );
        if (item.group === group) return [node];
        group = item.group;
        return [el('div', { className: 'quick-group', role: 'presentation', textContent: item.group }), node];
      }),
    );
    highlight(0);
  }

  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') highlight(index + 1);
    else if (e.key === 'ArrowUp') highlight(index - 1);
    else if (e.key === 'Home' && !input.value) highlight(0);
    else if (e.key === 'Enter' && !e.isComposing) choose(index);
    else return;
    e.preventDefault();
  });
  dialog.addEventListener('click', (e) => e.target === dialog && close());

  function close() {
    if (dialog.open) dialog.close();
  }
  function open() {
    if (dialog.open) return;
    input.value = '';
    render();
    dialog.showModal();
    input.focus();
  }

  return {
    open,
    close,
    toggle: () => (dialog.open ? close() : open()),
    get isOpen() {
      return dialog.open;
    },
  };
}
