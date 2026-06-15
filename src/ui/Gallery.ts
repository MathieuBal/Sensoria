import type { SceneMeta } from '../scenes/registry';

/**
 * Home gallery (§2.1): animated cards, one per tableau. Selecting an available
 * card opens it full-screen; unbuilt tableaux are shown as "Bientôt" so the
 * gallery already conveys the product's scope.
 */
export class Gallery {
  private readonly el: HTMLElement;

  constructor(
    container: HTMLElement,
    metas: SceneMeta[],
    onSelect: (id: string) => void
  ) {
    this.el = container;
    const grid = container.querySelector('#gallery-grid');
    if (!grid) throw new Error('Missing #gallery-grid');

    for (const meta of metas) {
      const card = document.createElement(meta.available ? 'button' : 'div');
      card.className = 'card' + (meta.available ? '' : ' card--soon');
      if (meta.available) {
        (card as HTMLButtonElement).type = 'button';
        card.addEventListener('click', () => onSelect(meta.id));
      }

      const preview = document.createElement('div');
      preview.className = 'card__preview';
      preview.style.background = meta.gradient;

      const body = document.createElement('div');
      body.className = 'card__body';
      const h2 = document.createElement('h2');
      h2.textContent = meta.name;
      const p = document.createElement('p');
      p.textContent = meta.tagline;
      body.append(h2, p);

      card.append(preview, body);

      if (!meta.available) {
        const badge = document.createElement('span');
        badge.className = 'card__badge';
        badge.textContent = 'Bientôt';
        card.appendChild(badge);
      }

      grid.appendChild(card);
    }
  }

  show(): void {
    this.el.classList.remove('is-hidden');
  }

  hide(): void {
    this.el.classList.add('is-hidden');
  }
}
