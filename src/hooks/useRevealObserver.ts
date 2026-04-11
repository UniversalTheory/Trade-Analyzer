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

      cards.forEach((card, i) => {
        if (card.classList.contains('is-revealed')) return;
        card.classList.add('reveal-pending');
        card.style.animationDelay = `${Math.min(i * STAGGER_MS, MAX_STAGGER_MS)}ms`;
        // Reveal immediately — stagger is handled by animation-delay alone
        requestAnimationFrame(() => {
          card.classList.remove('reveal-pending');
          card.classList.add('is-revealed');
        });
      });
    }, 60);

    return () => clearTimeout(timer);
  }, [activeTab]);
}
