import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  /** Animation duration in ms */
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/**
 * Counts from the previous value to the new value with an ease-out animation.
 * Use in place of any static price/number display that receives live updates.
 *
 * Example:
 *   <AnimatedNumber value={price} decimals={2} prefix="$" className="ticker-quote-price" />
 */
export function AnimatedNumber({ value, duration = 500, decimals = 2, prefix = '', suffix = '', className }: Props) {
  const [display, setDisplay] = useState(value);
  const prevRef  = useRef(value);
  const rafRef   = useRef<number>(0);

  useEffect(() => {
    const from = prevRef.current;
    const to   = value;
    if (from === to) return;

    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed  = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased    = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(to);
        prevRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return (
    <span className={className}>
      {prefix}{display.toFixed(decimals)}{suffix}
    </span>
  );
}
