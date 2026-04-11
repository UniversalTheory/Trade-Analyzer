import { useEffect } from 'react';

/**
 * All card/panel surface selectors that participate in reveal animations.
 * Matches the Phase A glass card list in index.css.
 */
const CARD_SELECTOR = [
  '.result-card',
  '.index-card',
  '.global-panel',
  '.panel-card',
  '.macro-panel',
  '.movers-panel',
  '.news-panel',
  '.sector-overview-panel',
  '.momentum-panel',
  '.gauge-panel',
  '.sector-news-panel',
  '.asset-profile-card',
  '.fundamentals-card',
  '.filings-card',
  '.ticker-quote-card',
  '.price-chart-card',
  '.technicals-panel',
  '.options-chain-card',
  '.trade-recs-card',
  '.interpretation-box',
  '.empty-state',
  '.input-panel',
].join(', ');

/** ms between each card's animation start */
const STAGGER_MS = 55;
/** cap so the last card in a dense layout doesn't wait forever */
const MAX_STAGGER_MS = 360;

/**
 * Drives the Phase C card stagger animation.
 * On each activeTab change, finds all visible cards, marks them pending,
 * assigns stagger delays, then immediately reveals them all.
 * Cards already revealed on a previous tab visit appear instantly.
 */
export function useRevealObserver(activeTab: string) {
  useEffect(() => {
    const timer = setTimeout(() => {
      // Only query cards that are actually rendered (excludes display:none tabs)
      const cards = Array.from(
        document.querySelectorAll<HTMLElement>(CARD_SELECTOR)
      ).filter(el => el.offsetParent !== null);

      // Reset any previously-revealed cards so they animate again on this tab visit
      cards.forEach(card => {
        card.classList.remove('was-revealed', 'is-revealed');
        card.style.animationDelay = '';
      });

      cards.forEach((card, i) => {

        card.classList.add('reveal-pending');
        card.style.animationDelay = `${Math.min(i * STAGGER_MS, MAX_STAGGER_MS)}ms`;

        requestAnimationFrame(() => {
          card.classList.remove('reveal-pending');
          card.classList.add('is-revealed');

          // After card-enter completes, swap is-revealed → was-revealed.
          // This releases animation-fill-mode control over `transform`,
          // which otherwise overrides the hover lift (transform: translateY(-2px)).
          //
          // Must filter by animationName AND target: animationend bubbles,
          // so child element animations (shimmer, live-pulse, etc.) would
          // otherwise trigger this prematurely.
          const onAnimEnd = (e: Event) => {
            const ae = e as AnimationEvent;
            if (e.target !== card || ae.animationName !== 'card-enter') return;
            card.classList.remove('is-revealed');
            card.classList.add('was-revealed');
            card.style.animationDelay = '';
            card.removeEventListener('animationend', onAnimEnd);
          };
          card.addEventListener('animationend', onAnimEnd);
        });
      });
    }, 60);

    return () => clearTimeout(timer);
  }, [activeTab]);
}
