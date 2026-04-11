/**
 * Triggers a directional color pulse on a DOM element when a live value updates.
 * Green pulse for price increases, red for decreases.
 *
 * Usage (in a component that receives live price updates):
 *
 *   const priceRef = useRef<HTMLSpanElement>(null);
 *   useEffect(() => {
 *     if (priceRef.current && prevPrice !== price) {
 *       pulseValue(priceRef.current, price > prevPrice ? 'up' : 'down');
 *     }
 *   }, [price]);
 *
 *   <span ref={priceRef}>{price}</span>
 */
export function pulseValue(el: HTMLElement, direction: 'up' | 'down'): void {
  // Remove existing pulse classes to allow re-triggering
  el.classList.remove('pulse-up', 'pulse-down');
  // Force reflow so the browser registers the class removal before re-adding
  void el.offsetWidth;
  el.classList.add(direction === 'up' ? 'pulse-up' : 'pulse-down');
}
