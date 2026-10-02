import type { Suggestion } from './search';

/**
 * Autocomplete dropdown for a text input (ARIA combobox pattern).
 * `suggest` is called 250 ms after typing pauses; `pick` when a row is chosen;
 * `edited` on every keystroke, so a previous pick can be forgotten.
 */
export function combobox(
  input: HTMLInputElement,
  opts: { suggest: (q: string) => Promise<Suggestion[]>; pick: (s: Suggestion) => void; edited: () => void },
) {
  const list = document.createElement('ul');
  list.id = `${input.name}-list`;
  list.className = 'listbox';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  // Outside the <label>, so clicks on a row are not forwarded to the input.
  const label = input.closest('label')!;
  const wrap = document.createElement('div');
  wrap.className = 'combo';
  label.replaceWith(wrap);
  wrap.append(label, list);

  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');

  let items: Suggestion[] = [];
  let active = -1;
  let timer = 0;
  let seq = 0;

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };

  const show = () => {
    list.replaceChildren(
      ...items.map((s, i) => {
        const li = document.createElement('li');
        li.id = `${list.id}-${i}`;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === active));
        const name = document.createElement('strong');
        name.textContent = s.name;
        const detail = document.createElement('span');
        detail.textContent = s.detail;
        li.append(name, detail);
        // mousedown would blur the input (closing the list) before click lands.
        li.addEventListener('mousedown', (e) => e.preventDefault());
        li.addEventListener('click', () => choose(i));
        return li;
      }),
    );
    list.hidden = items.length === 0;
    input.setAttribute('aria-expanded', String(!list.hidden));
    if (active >= 0) {
      input.setAttribute('aria-activedescendant', `${list.id}-${active}`);
      list.children[active].scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };

  const choose = (i: number) => {
    const s = items[i];
    input.value = s.name;
    close();
    opts.pick(s);
  };

  input.addEventListener('input', () => {
    opts.edited();
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 3) {
      seq++;
      close();
      return;
    }
    timer = window.setTimeout(async () => {
      const mine = ++seq;
      let found: Suggestion[] = [];
      try {
        found = await opts.suggest(q);
      } catch {
        /* no list; a search still reports the real error */
      }
      if (mine !== seq || document.activeElement !== input) return;
      items = found;
      active = -1;
      show();
    }, 250);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !list.hidden) {
      e.preventDefault();
      close();
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length) {
      e.preventDefault();
      const n = items.length;
      const down = e.key === 'ArrowDown';
      if (list.hidden || active < 0) active = down ? 0 : n - 1;
      else active = (active + (down ? 1 : -1) + n) % n;
      show();
    } else if (e.key === 'Enter' && !list.hidden && active >= 0) {
      e.preventDefault(); // pick the row instead of submitting the form
      choose(active);
    }
  });

  input.addEventListener('blur', close);
}
