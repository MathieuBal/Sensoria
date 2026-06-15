import type { SceneMeta } from '../scenes/registry';

const pad2 = (n: number): string => (n < 10 ? '0' : '') + n;

/**
 * Home gallery (Constella hub). Renders a starfield and the catalogue grid:
 * available tableaux first (clickable), then "Bientôt" placeholders. Card
 * numbers reflect the registry position (so 06/07 for the newest tableaux).
 */
export class Gallery {
  private readonly el: HTMLElement;

  constructor(
    container: HTMLElement,
    metas: SceneMeta[],
    onSelect: (id: string) => void
  ) {
    this.el = container;
    this.buildStarfield();

    const grid = container.querySelector('#gallery-grid');
    if (!grid) throw new Error('Missing #gallery-grid');

    const numbered = metas.map((meta, i) => ({ meta, num: pad2(i + 1) }));
    const available = numbered.filter((n) => n.meta.available);
    const soon = numbered.filter((n) => !n.meta.available);

    for (const { meta, num } of available) grid.appendChild(this.card(meta, num, onSelect));
    for (const { meta, num } of soon) grid.appendChild(this.card(meta, num, onSelect));

    const count = container.querySelector('#collection-count');
    if (count) count.textContent = `${pad2(available.length)} / ${pad2(metas.length)} jouables`;
  }

  show(): void {
    document.body.classList.remove('in-scene');
  }

  hide(): void {
    document.body.classList.add('in-scene');
  }

  private buildStarfield(): void {
    const sf = this.el.querySelector('#starfield');
    if (!sf || sf.childElementCount) return;
    for (let i = 0; i < 70; i++) {
      const d = document.createElement('span');
      const size = Math.random() * 2 + 0.6;
      d.style.cssText =
        `left:${Math.random() * 100}%;top:${Math.random() * 100}%;` +
        `width:${size}px;height:${size}px;opacity:${Math.random() * 0.5 + 0.1};` +
        `animation:twinkle ${3 + Math.random() * 5}s ease-in-out ${Math.random() * 5}s infinite`;
      sf.appendChild(d);
    }
  }

  private card(meta: SceneMeta, num: string, onSelect: (id: string) => void): HTMLElement {
    const card = document.createElement(meta.available ? 'button' : 'div');
    card.className = 'card' + (meta.available ? '' : ' card--soon');
    if (meta.available) {
      (card as HTMLButtonElement).type = 'button';
      card.addEventListener('click', () => onSelect(meta.id));
    }

    const preview = document.createElement('div');
    preview.className = 'card__preview';
    const grad = document.createElement('div');
    grad.className = 'card__grad';
    grad.style.background = meta.gradient;
    preview.appendChild(grad);
    if (meta.available) {
      preview.insertAdjacentHTML(
        'beforeend',
        '<div class="card__sweep"></div><div class="card__sheen"></div><div class="card__vignette"></div>'
      );
    } else {
      preview.insertAdjacentHTML('beforeend', '<div class="card__darken"></div><div class="card__vignette"></div>');
    }

    const body = document.createElement('div');
    body.className = 'card__body';
    body.innerHTML =
      `<div class="card__meta"><span class="card__num">${num}</span>` +
      `<span class="card__badge">${meta.available ? 'Disponible' : 'Bientôt'}</span></div>` +
      `<h3 class="card__title"></h3><p class="card__tag"></p>` +
      (meta.available ? '<span class="card__enter">Entrer <span aria-hidden="true">→</span></span>' : '');
    // Set text content safely (taglines/names are trusted constants, but keep it tidy).
    (body.querySelector('.card__title') as HTMLElement).textContent = meta.name;
    (body.querySelector('.card__tag') as HTMLElement).textContent = meta.tagline;

    card.append(preview, body);
    return card;
  }
}
